'use strict';

const { Op, UniqueConstraintError } = require('sequelize');
const { Company, Sector, Industry, ThemeStage, Theme } = require('../models');
const co = require('../lib/adminCompanies');
const companies = require('../lib/companies');
const { fail } = require('../lib/http');

const NOT_FOUND = 'Emiten tidak ditemukan.'; // COPY: perlu review
const refs = [
  { model: Sector, as: 'sector', attributes: ['id', 'slug', 'name'] },
  { model: Industry, as: 'industry', attributes: ['id', 'name'] },
];
const BULK_MAX = 200;
const PAGE_MAX = 100;

const { audit } = require('../lib/audit');

// Per ticker: first theme + how many of its stages hold the ticker ("Batubara · 2 tahap").
async function themeMap(tickers) {
  const stages = await ThemeStage.findAll({ include: [{ model: Theme, as: 'theme', attributes: ['slug', 'name'] }], order: [['order', 'ASC']] });
  const want = tickers ? new Set(tickers) : null;
  const byTicker = {};
  for (const st of stages) {
    for (const t of new Set(st.tickers)) {
      if (want && !want.has(t)) continue;
      const list = (byTicker[t] = byTicker[t] || new Map());
      const e = list.get(st.themeId) || { slug: st.theme.slug, name: st.theme.name, stageCount: 0, stages: [] };
      e.stageCount += 1;
      e.stages.push({ order: st.order, name: st.name });
      list.set(st.themeId, e);
    }
  }
  return Object.fromEntries(Object.entries(byTicker).map(([t, m]) => [t, [...m.values()]]));
}

// shortcut: loads every company (incl. profile JSON) to compute completeness/tabs in JS; fine for ~1k listings,
// upgrade: persist completeness columns when the list gets slow.
async function allItems() {
  const [rows, themes] = await Promise.all([Company.findAll({ include: refs }), themeMap()]);
  return rows.map((r) => co.listItem(r, (themes[r.ticker] || [])[0]));
}

const loadRow = (ticker) => Company.findByPk(ticker, { include: refs });
const tickerParam = (req) => companies.normTicker(req.params.ticker);

async function editView(row) {
  const isIpo = row.status === 'ipo';
  const form = row.draft || co.columnsToForm(row);
  const secs = co.sections(form, isIpo);
  const done = secs.filter((s) => s.ok).length;
  const themes = ((await themeMap([row.ticker]))[row.ticker]) || [];
  return {
    company: { ticker: row.ticker, status: row.status, logoUrl: row.logoUrl || null },
    publishStatus: { key: row.publishStatus, label: co.EDIT_STATUS[row.publishStatus] },
    published: !!row.publishedAt,
    hasDraft: !!row.draft,
    form,
    sections: secs,
    progress: { done, total: secs.length, percent: Math.round((done / secs.length) * 100) },
    canPublish: done === secs.length,
    themes,
    reports: [], // shortcut: user reports not built yet, see listItem
    updatedAt: row.updatedAt, updatedBy: row.updatedByName || 'Sistem',
  };
}

// Resolves sector/subsector text to FK ids. Unknown subsector text is kept in profile.subsector only.
async function resolveRefs(form) {
  const out = { sectorId: null, industryId: null };
  if (!form.sectorSlug) return out;
  const sector = await Sector.findOne({ where: { slug: form.sectorSlug }, attributes: ['id'] });
  if (!sector) return null;
  out.sectorId = sector.id;
  if (form.subsector) {
    const ind = await Industry.findOne({ where: { name: { [Op.iLike]: companies.escapeLike(form.subsector) } }, attributes: ['id'] });
    out.industryId = ind ? ind.id : null;
  }
  return out;
}

// GET /admin/api/companies?q=&tab=all|review|incomplete|ready&sector=&page=&pageSize=  — AdminEmiten
exports.index = async (req, res, next) => {
  const q = String(req.query.q || '').slice(0, 50);
  const sector = typeof req.query.sector === 'string' ? req.query.sector : '';
  const tab = ['all', 'review', 'incomplete', 'ready'].includes(req.query.tab) ? req.query.tab : 'all';
  const pageSize = Math.min(PAGE_MAX, Math.max(1, parseInt(req.query.pageSize, 10) || 14));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const [items, sectors] = await Promise.all([allItems(), Sector.findAll({ attributes: ['slug', 'name'], order: [['position', 'ASC']] })]);
    const { tabs, rows } = co.filterList(items, { q, sector, tab });
    res.json({
      total: rows.length, page, pageSize, tabs,
      sectors: sectors.map((s) => ({ slug: s.slug, name: s.name })),
      items: rows.slice((page - 1) * pageSize, page * pageSize),
    });
  } catch (err) {
    next(err);
  }
};

// GET /admin/api/companies/export.csv?tickers=A,B  — "Ekspor CSV" (all) / bulk "Ekspor CSV" (selected)
exports.exportCsv = async (req, res, next) => {
  try {
    let items = await allItems();
    if (typeof req.query.tickers === 'string' && req.query.tickers) {
      const want = new Set(req.query.tickers.split(',').map(companies.normTicker));
      items = items.filter((i) => want.has(i.ticker));
    }
    items.sort((a, b) => a.ticker.localeCompare(b.ticker));
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="emiten.csv"' });
    res.send(co.toCsv(items));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/companies/bulk-review { tickers } — "Tandai perlu ditinjau"
exports.bulkReview = async (req, res, next) => {
  const raw = req.body && req.body.tickers;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > BULK_MAX) {
    return fail(res, 422, 'VALIDATION', `Pilih 1–${BULK_MAX} emiten.`, { tickers: `Pilih 1–${BULK_MAX} emiten.` }); // COPY: perlu review
  }
  const tickers = [...new Set(raw.map(companies.normTicker).filter(companies.isTicker))];
  try {
    const [updated] = await Company.update(
      { publishStatus: 'review', updatedByName: req.admin.name },
      { where: { ticker: tickers, publishStatus: { [Op.ne]: 'review' } } },
    );
    await audit(req, 'company_bulk_review', tickers.join(',').slice(0, 80));
    res.json({ updated });
  } catch (err) {
    next(err);
  }
};

// GET /admin/api/companies/:ticker — AdminEmitenEdit / AdminEmitenIPO (form + checklist in one call)
exports.show = async (req, res, next) => {
  const ticker = tickerParam(req);
  if (!companies.isTicker(ticker)) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);
  try {
    const row = await loadRow(ticker);
    if (!row) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);
    res.json(await editView(row));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/companies — AdminEmitenIPO "Simpan draf" for a new IPO company. Not visible to customers until published.
exports.create = async (req, res, next) => {
  const { ticker, form, errors } = co.validateCreate(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    if (await Company.findByPk(ticker, { attributes: ['ticker'] })) {
      return fail(res, 409, 'TICKER_TAKEN', co.MSG.tickerTaken(ticker), { ticker: co.MSG.tickerTaken(ticker) });
    }
    if (!(await resolveRefs(form))) return fail(res, 422, 'VALIDATION', co.MSG.unknownSector, { sectorSlug: co.MSG.unknownSector });
    await Company.create({
      ticker, name: form.name, status: 'ipo', publishStatus: 'draft', publishedAt: null, draft: form, updatedByName: req.admin.name, profile: {},
    });
    await audit(req, 'company_created', ticker);
    res.status(201).json(await editView(await loadRow(ticker)));
  } catch (err) {
    if (err instanceof UniqueConstraintError) return fail(res, 409, 'TICKER_TAKEN', co.MSG.tickerTaken(ticker), { ticker: co.MSG.tickerTaken(ticker) });
    next(err);
  }
};

// PATCH /admin/api/companies/:ticker — "Simpan draf". Replaces only the sections sent; customers keep seeing the published version.
exports.saveDraft = async (req, res, next) => {
  const ticker = tickerParam(req);
  if (!companies.isTicker(ticker)) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);
  const { values, errors } = co.validateForm(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    const row = await loadRow(ticker);
    if (!row) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);
    const form = { ...(row.draft || co.columnsToForm(row)), ...values };
    if (row.status !== 'ipo') form.ipo = null;
    if (row.status === 'ipo' && !form.ipo) form.ipo = co.emptyForm(true).ipo;
    if (!form.name.trim()) return fail(res, 422, 'VALIDATION', co.MSG.nameRequired, { name: co.MSG.nameRequired });
    if (!(await resolveRefs(form))) return fail(res, 422, 'VALIDATION', co.MSG.unknownSector, { sectorSlug: co.MSG.unknownSector });
    await row.update({ draft: form, publishStatus: 'draft', updatedByName: req.admin.name });
    await audit(req, 'company_draft_saved', ticker);
    res.json(await editView(row));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/companies/:ticker/publish — "Terbitkan". Needs the `publish` permission and a complete checklist.
exports.publish = async (req, res, next) => {
  const ticker = tickerParam(req);
  if (!companies.isTicker(ticker)) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);
  try {
    const row = await loadRow(ticker);
    if (!row) return fail(res, 404, 'NOT_FOUND', NOT_FOUND);
    const form = row.draft || co.columnsToForm(row);
    const missing = co.sections(form, row.status === 'ipo').filter((s) => !s.ok);
    if (missing.length) {
      return fail(res, 422, 'INCOMPLETE', co.MSG.incomplete(missing.map((s) => s.label)), Object.fromEntries(missing.map((s) => [s.key, s.note])));
    }
    const ids = await resolveRefs(form);
    if (!ids) return fail(res, 422, 'VALIDATION', co.MSG.unknownSector, { sectorSlug: co.MSG.unknownSector });
    await row.update({
      ...co.formToColumns(form, row), ...ids,
      draft: null, publishStatus: 'published', publishedAt: row.publishedAt || new Date(), updatedByName: req.admin.name,
    });
    await audit(req, 'company_published', ticker);
    res.json(await editView(await loadRow(ticker)));
  } catch (err) {
    next(err);
  }
};

