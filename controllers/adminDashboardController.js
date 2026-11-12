'use strict';

const { Op, QueryTypes } = require('sequelize');
const { sequelize, Company, Industry, ThemeStage, Subsector, Sector, User, AdminAuditLog, AdminUser, SyncJob, SyncFailure, SyncConflict } = require('../models');
const dash = require('../lib/adminDashboard');
const th = require('../lib/adminThemes');
const hist = require('../lib/adminHistory');
const sync = require('../lib/sync');
const { withSector } = require('../lib/themes');
const { can } = require('../lib/adminRoles');

const DAY = 24 * 60 * 60 * 1000;
const themeRefs = { include: [
  { model: Subsector, as: 'subsector', attributes: ['id', 'sectorId'], include: [{ model: Sector, as: 'sector', attributes: ['id', 'slug', 'name'] }] },
  { model: ThemeStage, as: 'stages' },
] };

// What the editor shows for a company: the open draft wins over the published columns.
const SUMMARY_EMPTY = `coalesce(nullif(btrim(coalesce(draft->'summary'->>'short', summary, '')), ''), nullif(btrim(coalesce(draft->'summary'->>'overview', profile->>'overview', '')), '')) IS NULL`;
const REVENUE = `CASE WHEN jsonb_typeof(draft->'revenueSources') = 'array' THEN draft->'revenueSources' WHEN jsonb_typeof(profile->'revenueSources') = 'array' THEN profile->'revenueSources' ELSE '[]'::jsonb END`;
const SOURCE_MISSING = `EXISTS (SELECT 1 FROM jsonb_array_elements(${REVENUE}) r WHERE btrim(coalesce(r->>'source', '')) = '')`;

// One pass over market_companies for every company count on the page.
async function companyCounts(now) {
  const { from, to } = dash.monthRange(now);
  const [row] = await sequelize.query(
    `SELECT
       count(*) FILTER (WHERE status <> 'ipo') AS total,
       count(*) FILTER (WHERE status <> 'ipo' AND "publishStatus" = 'published') AS ready,
       count(*) FILTER (WHERE "publishStatus" = 'review') AS review,
       count(*) FILTER (WHERE status <> 'ipo' AND ${SUMMARY_EMPTY}) AS no_summary,
       count(*) FILTER (WHERE status <> 'ipo' AND ${SOURCE_MISSING}) AS no_source,
       count(*) FILTER (WHERE status = 'ipo' AND "publishStatus" = 'draft') AS ipo_new,
       count(*) FILTER (WHERE ipo->>'listingDate' >= :from AND ipo->>'listingDate' < :to) AS ipo_month
     FROM market_companies`,
    { replacements: { from, to }, type: QueryTypes.SELECT },
  );
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Number(v)]));
}

async function coverage() {
  const [themes, companies] = await Promise.all([
    Industry.findAll(themeRefs).then((list) => list.map(withSector)),
    Company.findAll({ attributes: ['ticker', 'publishStatus'], raw: true }),
  ]);
  const readyMap = Object.fromEntries(companies.map((c) => [c.ticker, c.publishStatus === 'published']));
  const rows = themes.map((t) => th.listRow(t, th.formOf(t), readyMap));
  return { rows, review: rows.filter((r) => r.status === 'review').length };
}

async function syncBlock(now) {
  const [jobs, failures, conflicts] = await Promise.all([
    SyncJob.findAll({ order: [['createdAt', 'ASC'], ['key', 'ASC']] }),
    SyncFailure.findAll({ where: { resolvedAt: null }, attributes: ['jobKey', 'ticker', 'message'], order: [['ticker', 'ASC']], raw: true }),
    SyncConflict.count({ where: { resolvedAt: null }, group: ['jobKey'] }),
  ]);
  const confs = Object.fromEntries(conflicts.map((c) => [c.jobKey, c.count]));
  const failsOf = (key) => failures.filter((f) => f.jobKey === key);
  return {
    beiChanges: conflicts.reduce((n, c) => n + c.count, 0),
    jobs: jobs.map((j) => {
      const f = failsOf(j.key);
      const v = sync.jobView(j, { openFails: f.length, openConflicts: confs[j.key] || 0, now });
      return {
        key: v.key, name: v.name, lastFinishedAt: v.lastFinishedAt, status: v.status, failed: v.failed, note: v.note,
        failedTickers: f.filter((x) => x.ticker).slice(0, 5).map((x) => x.ticker), failMessage: f.length ? f[0].message : null,
      };
    }),
  };
}

async function recentActivity() {
  const rows = await AdminAuditLog.findAll({
    where: { action: { [Op.notIn]: hist.HIDDEN_ACTIONS }, module: { [Op.or]: { [Op.ne]: 'security', [Op.is]: null } } }, // logins are not "work"
    include: [{ model: AdminUser, attributes: ['id', 'name'], required: false }],
    order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: dash.ACTIVITY_MAX,
  });
  return rows.map((r) => dash.activity(hist.entryView(r.get({ plain: true }), { actorName: r.AdminUser ? r.AdminUser.name : null })));
}

// GET /admin/api/dashboard — AdminDashboard. Needs dash:view; every block also needs the module its data comes from
// (em, tm, usr, sync, log) and is null without it, so the page never shows numbers the role can't open elsewhere.
exports.index = async (req, res, next) => {
  const allowed = Object.fromEntries(['em', 'tm', 'usr', 'sync', 'log'].map((m) => [m, can(req.adminPerms, m, 'view')]));
  const now = new Date();
  try {
    const [cc, cov, users, syn, act, lastSyncAt, ipoNew] = await Promise.all([
      allowed.em ? companyCounts(now) : null,
      allowed.tm ? coverage() : null,
      allowed.usr ? Promise.all([User.count(), User.count({ where: { createdAt: { [Op.gte]: new Date(now - 7 * DAY) } } })]) : null,
      allowed.sync ? syncBlock(now) : null,
      allowed.log ? recentActivity() : null,
      SyncJob.max('lastFinishedAt'),
      allowed.em ? Company.findAll({ where: { status: 'ipo', publishStatus: 'draft' }, attributes: ['ticker'], order: [['updatedAt', 'DESC']], limit: 3, raw: true }) : null,
    ]);
    res.json({
      now, lastSyncAt: lastSyncAt || null,
      kpis: {
        companies: cc && { total: cc.total, ipoThisMonth: cc.ipo_month },
        ready: cc && { count: cc.ready, percent: dash.percent(cc.ready, cc.total) },
        review: cc && { count: cc.review, fromReports: null }, // shortcut: user reports ("Masukan & laporan") not built, upgrade: count open tickets
        users: users && { total: users[0], newThisWeek: users[1] },
      },
      queue: dash.queue({
        beiChanges: syn ? syn.beiChanges : 0, themeReview: cov ? cov.review : 0,
        companyReview: cc ? cc.review : 0, noSource: cc ? cc.no_source : 0, noSummary: cc ? cc.no_summary : 0,
        ipoNew: cc ? cc.ipo_new : 0, ipoTickers: ipoNew ? ipoNew.map((r) => r.ticker) : [],
      }, allowed),
      sync: syn && { jobs: syn.jobs },
      coverage: cov && { threshold: th.READY_MIN, items: dash.coverage(cov.rows, th.READY_MIN) },
      activity: act,
    });
  } catch (err) {
    next(err);
  }
};
