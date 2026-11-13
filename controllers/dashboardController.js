'use strict';

const { Op, UniqueConstraintError } = require('sequelize');
const { Company, CompanyAlert, DashboardDismissal, PortfolioHolding, SyncJob } = require('../models');
const dash = require('../lib/dashboard');
const { snapshot } = require('./portfolioController');
const { fail } = require('../lib/http');

const NO_ACTION = 'Hal ini sudah tidak ada.'; // COPY: perlu review

// "Perlu tindakan" for the stocks the user holds. Only suspensions exist so far: "Kondisi tesis terpicu" and "Bobot melenceng"
// need theses (target weights, conditions), which the Tesis module will add here.
// `all` includes cards already marked "Selesai": the done endpoint validates against it.
async function actionsFor(userId, tickers) {
  const [suspended, dismissed] = await Promise.all([
    tickers.length ? Company.findAll({ where: { ticker: tickers, status: 'suspended' }, attributes: ['ticker', 'profile'], raw: true }) : [],
    DashboardDismissal.findAll({ where: { userId }, attributes: ['key'], raw: true }),
  ]);
  const hidden = new Set(dismissed.map((d) => d.key));
  const all = dash.suspensionActions(suspended);
  return { all, open: all.filter((a) => !hidden.has(a.id)) };
}

// GET /dashboard — design: Main (Beranda). One call for the whole page.
// Not built yet, returned empty/null so the client can already render the final shape:
//   changes ("Perubahan bisnis"): needs the BEI disclosure feed (sync job `kip`); approved profile syncs can't tell a real
//     change from the first data load, so they are not used.
//   thesis ("Kesehatan tesis") and allocation.slices.tesis: need the Tesis module.
exports.index = async (req, res, next) => {
  const now = new Date();
  try {
    const [pf, ipoRows, alerts, lastSync] = await Promise.all([
      snapshot(req.user.id),
      Company.findAll({ where: { status: 'ipo', publishedAt: { [Op.ne]: null } }, attributes: ['ticker', 'name', 'logoUrl', 'ipo'], raw: true }),
      CompanyAlert.findAll({ where: { userId: req.user.id, kind: 'listing' }, attributes: ['ticker'], raw: true }),
      SyncJob.max('lastFinishedAt'),
    ]);
    const { open } = await actionsFor(req.user.id, pf.holdings.map((h) => h.ticker));
    const ipos = dash.ipoItems(ipoRows, now);
    res.json({
      firstName: dash.firstName(req.user.name),
      empty: pf.holdings.length === 0, // BerandaKosong: nothing held (and no thesis exists yet)
      dataAsOf: lastSync || null, // "Data BEI per …": last finished BEI sync
      actions: open,
      schedule: dash.schedule(ipos, alerts.map((a) => a.ticker)),
      changes: [],
      ipos,
      thesis: null,
      allocation: dash.allocation(pf.holdings),
    });
  } catch (err) {
    next(err);
  }
};

// POST /dashboard/actions/:id/done — "Selesai": hides that card for this user only. Idempotent; 204.
// Only an id that is (or was) a real card for the user's holdings is accepted.
exports.done = async (req, res, next) => {
  try {
    const held = await PortfolioHolding.findAll({ where: { userId: req.user.id }, attributes: ['ticker'], raw: true });
    const { all } = await actionsFor(req.user.id, held.map((h) => h.ticker));
    if (!all.some((a) => a.id === req.params.id)) return fail(res, 404, 'NOT_FOUND', NO_ACTION);
    try {
      await DashboardDismissal.findOrCreate({ where: { userId: req.user.id, key: req.params.id } });
    } catch (err) {
      if (!(err instanceof UniqueConstraintError)) throw err; // two taps at once: already hidden
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
