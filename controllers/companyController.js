'use strict';

const { Op, literal } = require('sequelize');
const { Company, Sector, Industry, ThemeStage, WatchlistItem, CompanyAlert } = require('../models');
const companies = require('../lib/companies');
const themes = require('../lib/themes');
const { fail } = require('../lib/http');

const refs = [
  { model: Sector, as: 'sector', attributes: ['slug', 'name'] },
  { model: Industry, as: 'industry', attributes: ['slug', 'name'] },
];

const MAX_MATCHES = 200; // rows returned by the search; total/sectors still count every match
const HAS_REPORT = `CASE WHEN jsonb_typeof("Company"."profile"->'reports') = 'array' AND jsonb_array_length("Company"."profile"->'reports') > 0 THEN true ELSE false END`;
const PEERS = 4;
const NOT_FOUND = 'Emiten tidak ditemukan.'; // COPY: perlu review

// URL segment → stored kind.
const ALERT_KINDS = { listing: 'listing', 'data-update': 'data_update' };

// GET /companies?q=bu&sector=energi — design: EmitenSearch. Without q, ?sector= browses one sector
// ("Jelajahi berdasarkan sektor"); neither → empty result (EmitenKosong). Each row carries its published
// themes ("Tema terkait") and inWatchlist (bookmark state).
exports.index = async (req, res, next) => {
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 50);
  const sector = typeof req.query.sector === 'string' && req.query.sector ? req.query.sector : null;
  if (!q && !sector) return res.json({ query: '', total: 0, sectors: [], companies: [] });

  try {
    const like = companies.escapeLike(q);
    // Every match is loaded (facets and the order need all of them) but only light columns: `profile` is left out and
    // hasReport is computed in SQL. Only the returned list is capped.
    const rows = await Company.findAll({
      attributes: ['ticker', 'name', 'logoUrl', 'status', 'summary', 'sizeClass', 'marketCap', [literal(HAS_REPORT), 'hasReport']],
      where: {
        publishedAt: { [Op.ne]: null },
        ...(q ? {
          [Op.or]: [
            { ticker: { [Op.iLike]: `${like}%` } },
            { name: { [Op.iLike]: `%${like}%` } },
            { '$industry.name$': { [Op.iLike]: `%${like}%` } },
          ],
        } : { '$sector.slug$': sector }),
      },
      include: refs,
      subQuery: false,
      raw: true,
      nest: true,
    });
    const result = companies.searchResult(rows, q, sector, MAX_MATCHES);
    const tickers = result.companies.map((c) => c.ticker);
    const [stages, watch] = tickers.length ? await Promise.all([
      ThemeStage.findAll({
        where: themes.stagesWithAny(tickers),
        include: [{ model: Industry, as: 'theme', where: themes.clientVisible({ publishedAt: { [Op.ne]: null } }), attributes: ['slug', 'name'] }],
      }),
      WatchlistItem.findAll({ where: { userId: req.user.id, ticker: tickers }, attributes: ['ticker'] }),
    ]) : [[], []];
    const related = themes.themesByTicker(stages, tickers);
    const saved = new Set(watch.map((w) => w.ticker));
    result.companies = result.companies.map((c) => ({ ...c, themes: related[c.ticker], inWatchlist: saved.has(c.ticker) }));
    res.json({ query: q, ...result });
  } catch (err) {
    next(err);
  }
};

const peerAttrs = ['ticker', 'name', 'logoUrl', 'tagline', 'marketCap'];

// "Satu tahap dengan …": same stage of the first published theme; falls back to same industry.
async function findPeers(row, stages) {
  const first = [...stages].sort((a, b) => a.order - b.order)[0];
  if (first) {
    const others = [...new Set(first.tickers)].filter((t) => t !== row.ticker);
    const list = others.length ? await Company.findAll({ where: { ticker: others, publishedAt: { [Op.ne]: null } }, attributes: peerAttrs }) : [];
    list.sort(companies.byMarketCap);
    return {
      basis: 'stage',
      theme: { slug: first.theme.slug, name: first.theme.name },
      stage: { order: first.order, name: first.name },
      total: list.length,
      items: list.slice(0, PEERS).map(companies.peer),
    };
  }
  const list = row.industryId
    ? await Company.findAll({ where: { industryId: row.industryId, ticker: { [Op.ne]: row.ticker }, publishedAt: { [Op.ne]: null } }, attributes: peerAttrs })
    : [];
  list.sort(companies.byMarketCap);
  return { basis: list.length ? 'industry' : null, theme: null, stage: null, total: list.length, items: list.slice(0, PEERS).map(companies.peer) };
}

// GET /companies/:ticker — design: Emiten, EmitenIPO, EmitenDataTertunda.
exports.show = async (req, res, next) => {
  const ticker = companies.normTicker(req.params.ticker);
  if (!companies.isTicker(ticker)) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);

  try {
    const row = await Company.findOne({ where: { ticker, publishedAt: { [Op.ne]: null } }, include: refs });
    if (!row) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);

    const [stages, watch, alerts] = await Promise.all([
      ThemeStage.findAll({
        where: { tickers: { [Op.contains]: [ticker] } },
        include: [{ model: Industry, as: 'theme', where: themes.clientVisible({ publishedAt: { [Op.ne]: null } }), attributes: ['id', 'slug', 'name'] }],
      }),
      WatchlistItem.findOne({ where: { userId: req.user.id, ticker }, attributes: ['id'] }),
      CompanyAlert.findAll({ where: { userId: req.user.id, ticker }, attributes: ['kind'] }),
    ]);

    const themeIds = [...new Set(stages.map((s) => s.industryId))];
    const counts = themeIds.length
      ? await ThemeStage.count({ where: { industryId: themeIds }, group: ['industryId'] })
      : [];
    const stageCounts = Object.fromEntries(counts.map((c) => [c.industryId, Number(c.count)]));
    const kinds = alerts.map((a) => a.kind);

    res.json({
      company: { ...companies.detail(row), themes: companies.themesView(stages, stageCounts) },
      peers: await findPeers(row, stages),
      viewer: {
        inWatchlist: !!watch,
        alerts: { listing: kinds.includes('listing'), dataUpdate: kinds.includes('data_update') },
      },
    });
  } catch (err) {
    next(err);
  }
};

// PUT|DELETE /companies/:ticker/alerts/:kind — "Ingatkan saat tercatat" (listing), "Kabari saat diperbarui" (data-update).
async function alertTarget(req, res) {
  const kind = ALERT_KINDS[req.params.kind];
  const ticker = companies.normTicker(req.params.ticker);
  if (!kind || !companies.isTicker(ticker)) {
    fail(res, 404, 'NOT_FOUND', NOT_FOUND);
    return null;
  }
  const row = await Company.findOne({ where: { ticker, publishedAt: { [Op.ne]: null } }, attributes: ['ticker', 'status'] });
  if (!row) {
    fail(res, 404, 'NOT_FOUND', NOT_FOUND);
    return null;
  }
  return { kind, ticker, row };
}

exports.subscribe = async (req, res, next) => {
  try {
    const t = await alertTarget(req, res);
    if (!t) return;
    if (t.kind === 'listing' && t.row.status !== 'ipo') {
      return fail(res, 422, 'NOT_IPO', 'Emiten ini sudah tercatat di bursa.'); // COPY: perlu review
    }
    await CompanyAlert.findOrCreate({ where: { userId: req.user.id, ticker: t.ticker, kind: t.kind } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

exports.unsubscribe = async (req, res, next) => {
  try {
    const t = await alertTarget(req, res);
    if (!t) return;
    await CompanyAlert.destroy({ where: { userId: req.user.id, ticker: t.ticker, kind: t.kind } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
