'use strict';

const { Theme, ThemeStage, Sector, Company, WatchlistItem } = require('../models');
const themes = require('../lib/themes');
const { fail } = require('../lib/http');

const companyAttrs = ['ticker', 'name', 'summary', 'logoUrl', 'status', 'tagline', 'marketCap', 'priceDate', 'profile'];

// GET /themes/:slug — design: TemaDetail + TemaDetailTabel + drawer. Only published themes are visible.
exports.show = async (req, res, next) => {
  try {
    const theme = await Theme.findOne({
      where: { slug: String(req.params.slug || ''), status: 'published' },
      include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: ThemeStage, as: 'stages' }],
    });
    if (!theme) return fail(res, 404, 'NOT_FOUND', 'Tema tidak ditemukan.'); // COPY: perlu review

    const tickers = themes.companyOrder(theme.stages);
    const [rows, watch] = await Promise.all([
      tickers.length ? Company.findAll({ where: { ticker: tickers }, attributes: companyAttrs }) : [],
      tickers.length ? WatchlistItem.findAll({ where: { userId: req.user.id, ticker: tickers }, attributes: ['ticker'] }) : [],
    ]);
    res.json(themes.themeView(theme, theme.stages, rows, watch.map((w) => w.ticker)));
  } catch (err) {
    next(err);
  }
};
