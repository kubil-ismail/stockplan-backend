'use strict';

const { isDeepStrictEqual } = require('util');
const { Op, QueryTypes } = require('sequelize');
const { sequelize, SyncJob, SyncFailure, SyncConflict, Company, Sector, Industry } = require('../models');
const sync = require('../lib/sync');
const co = require('../lib/adminCompanies');
const hist = require('../lib/adminHistory');
const { can } = require('../lib/adminRoles');
const { audit } = require('../lib/audit');
const { fail } = require('../lib/http');

const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));
// Same includes as the company editor, so columnsToForm sees sector/industry.
const companyRefs = [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: Industry, as: 'industry', attributes: ['name'] }];
const formOf = (row) => row.draft || co.columnsToForm(row);

// ---- admin ----

// GET /admin/api/sync — AdminSinkron: jobs, open failures, open conflicts, 14-day failure history.
exports.index = async (req, res, next) => {
  try {
    const now = new Date();
    const [jobs, failures, conflicts, history, companies] = await Promise.all([
      SyncJob.findAll({ order: [['createdAt', 'ASC'], ['key', 'ASC']] }),
      SyncFailure.findAll({ where: { resolvedAt: null }, order: [['jobKey', 'ASC'], ['ticker', 'ASC']] }),
      SyncConflict.findAll({ where: { resolvedAt: null }, include: [{ model: Company, as: 'company', include: companyRefs }], order: [['updatedAt', 'DESC']] }),
      sequelize.query(
        `SELECT to_char(("createdAt" AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS day, COUNT(DISTINCT COALESCE(ticker, "jobKey")) AS n
         FROM sync_failures WHERE "createdAt" >= :since GROUP BY 1`,
        { replacements: { since: new Date(now - (sync.HISTORY_DAYS + 1) * 86400000) }, type: QueryTypes.SELECT },
      ),
      Company.count({ where: { status: { [Op.ne]: 'ipo' } } }),
    ]);
    const tally = (rows) => rows.reduce((m, r) => ({ ...m, [r.jobKey]: (m[r.jobKey] || 0) + 1 }), {});
    const fails = tally(failures);
    const confs = tally(conflicts);
    const byKey = Object.fromEntries(jobs.map((j) => [j.key, j]));
    const finished = jobs.map((j) => j.lastFinishedAt).filter(Boolean);
    res.json({
      stats: { companies, lastFullSyncAt: finished.length ? new Date(Math.max(...finished)) : null },
      jobs: jobs.map((j) => sync.jobView(j, { openFails: fails[j.key] || 0, openConflicts: confs[j.key] || 0, now })),
      failures: failures.map((f) => sync.failureView(f, byKey[f.jobKey], now)),
      conflicts: conflicts.map((c) => sync.conflictView(c, formOf(c.company))),
      history: sync.historyDays(history, now),
    });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/sync/run { key? } — "Jalankan sekarang" (one job) or "Sinkron semua sekarang" (no key).
exports.run = async (req, res, next) => {
  const key = req.body && req.body.key;
  try {
    const jobs = key ? [await SyncJob.findByPk(String(key))].filter(Boolean) : await SyncJob.findAll();
    if (!jobs.length) return fail(res, 404, 'NOT_FOUND', sync.MSG.jobNotFound);
    const now = new Date();
    await SyncJob.update({ requestedAt: now, requestedTickers: null }, { where: { key: jobs.map((j) => j.key) } });
    await audit(req, 'sync_run_requested', key ? jobs[0].key : 'all', { summary: { verb: 'menjalankan sinkron', target: key ? jobs[0].name : 'semua data', rest: '' } });
    res.json({ message: key ? sync.MSG.queued(jobs[0].name) : sync.MSG.queuedAll });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/sync/failures/:id/retry — "Coba lagi": queues the job for just that ticker.
exports.retry = async (req, res, next) => {
  try {
    const f = isUuid(req.params.id) && (await SyncFailure.findOne({ where: { id: req.params.id, resolvedAt: null }, include: [{ model: SyncJob, as: 'job' }] }));
    if (!f) return fail(res, 404, 'NOT_FOUND', sync.MSG.failureNotFound);
    await f.job.update({ requestedAt: new Date(), requestedTickers: sync.mergeRequest(f.job, f.ticker ? [f.ticker] : null) });
    await audit(req, 'sync_retry_requested', f.ticker || f.jobKey, { summary: { verb: 'mencoba ulang sinkron', target: f.ticker || f.job.name, rest: `· ${f.job.name}` } });
    res.json({ message: sync.MSG.retry(f.ticker || f.job.name) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/sync/conflicts/:id/resolve { use: 'bei' | 'team' }
// bei: writes the BEI value into the company DRAFT (still needs "Terbitkan"), revertable from Riwayat. Needs em:edit too.
exports.resolve = async (req, res, next) => {
  const use = req.body && req.body.use;
  if (use !== 'bei' && use !== 'team') return fail(res, 422, 'VALIDATION', sync.MSG.badChoice, { use: sync.MSG.badChoice });
  if (use === 'bei' && !can(req.adminPerms, 'em', 'edit')) return fail(res, 403, 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'); // COPY: perlu review
  try {
    const c = isUuid(req.params.id) && (await SyncConflict.findByPk(req.params.id));
    if (!c) return fail(res, 404, 'NOT_FOUND', sync.MSG.conflictNotFound);
    let logged = null;
    const ok = await sequelize.transaction(async (transaction) => {
      // Claim first so two admins can't both resolve it.
      const [claimed] = await SyncConflict.update({ resolvedAt: new Date(), resolution: use, resolvedById: req.admin.id }, { where: { id: c.id, resolvedAt: null }, transaction });
      if (!claimed) return false;
      if (use === 'team') return true;
      const row = await Company.findByPk(c.ticker, { include: companyRefs, transaction, lock: { level: transaction.LOCK.UPDATE, of: Company } });
      const before = formOf(row);
      const ch = hist.sectionChange(before, { [c.section]: sync.withBei(before, c.section, c.value) });
      if (!ch.keys.length) return true; // team already matches BEI
      await row.update({ draft: { ...before, ...ch.afterPart }, publishStatus: 'draft', updatedByName: req.admin.name }, { transaction });
      logged = ch;
      return true;
    });
    if (!ok) return fail(res, 409, 'ALREADY_RESOLVED', sync.MSG.conflictDone);
    await audit(req, 'sync_conflict_resolved', c.ticker, {
      summary: { verb: use === 'bei' ? 'memakai data BEI untuk' : 'mempertahankan isian tim untuk', target: c.ticker, rest: `· ${c.field}${logged ? ' (draf)' : ''}` },
      changes: logged ? logged.changes : null,
      revert: logged ? { type: 'company_sections', ref: c.ticker, before: logged.beforePart, after: logged.afterPart } : null,
    });
    res.json({ message: use === 'bei' ? sync.MSG.usedBei(c.ticker) : sync.MSG.keptTeam(c.ticker) });
  } catch (err) {
    next(err);
  }
};

// ---- crawler (Bearer SYNC_TOKEN) ----

// GET /admin/api/sync/agent/queue — claims every requested job (or a dead run) and returns what to run.
exports.queue = async (req, res, next) => {
  try {
    const now = new Date();
    const [, rows] = await SyncJob.update({ runningSince: now, requestedAt: null }, {
      where: { requestedAt: { [Op.ne]: null }, [Op.or]: [{ runningSince: null }, { runningSince: { [Op.lt]: new Date(now - sync.RUN_TIMEOUT_MS) } }] },
      returning: true,
    });
    res.json({ jobs: rows.map((j) => ({ key: j.key, tickers: j.requestedTickers || null })) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/sync/agent/jobs/:key/report — result of one run (scheduled or claimed from the queue).
exports.report = async (req, res, next) => {
  const { report, errors } = sync.validateReport(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Laporan sinkron tidak valid.', errors);
  try {
    const job = await SyncJob.findByPk(req.params.key);
    if (!job) return fail(res, 404, 'NOT_FOUND', sync.MSG.jobNotFound);
    const scope = report.tickers;
    const out = { failures: report.failures.length, conflicts: 0, skipped: [] };
    await sequelize.transaction(async (transaction) => {
      // A run replaces the open failures it covered: all of them, or only the retried tickers.
      await SyncFailure.update({ resolvedAt: report.finishedAt }, { where: { jobKey: job.key, resolvedAt: null, ...(scope && { ticker: scope }) }, transaction });
      if (report.failures.length) await SyncFailure.bulkCreate(report.failures.map((f) => ({ ...f, jobKey: job.key })), { transaction });

      for (const c of report.conflicts) {
        const company = await Company.findByPk(c.ticker, { include: companyRefs, transaction });
        if (!company) { out.skipped.push(c.ticker); continue; }
        const current = formOf(company);
        const open = await SyncConflict.findOne({ where: { ticker: c.ticker, section: c.section, resolvedAt: null }, transaction });
        const same = isDeepStrictEqual(current[c.section], sync.withBei(current, c.section, c.value));
        const last = !open && !same && (await SyncConflict.findOne({ where: { ticker: c.ticker, section: c.section, resolvedAt: { [Op.ne]: null } }, order: [['resolvedAt', 'DESC']], transaction }));
        if (same || sync.alreadyKept(last, c.value)) {
          if (open && same) await open.update({ resolvedAt: new Date(), resolution: 'same' }, { transaction }); // team caught up meanwhile
          continue;
        }
        if (open) await open.update({ jobKey: job.key, field: c.field, reason: c.reason, value: c.value }, { transaction });
        else await SyncConflict.create({ ...c, jobKey: job.key }, { transaction });
        out.conflicts += 1;
      }

      await job.update({
        runningSince: null,
        ...(report.nextRunAt && { nextRunAt: report.nextRunAt }),
        ...(!scope && {
          lastStartedAt: report.startedAt, lastFinishedAt: report.finishedAt, lastOk: report.ok, lastTotal: report.total,
          lastDetail: report.detail, note: report.note,
        }),
      }, { transaction });
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
};
