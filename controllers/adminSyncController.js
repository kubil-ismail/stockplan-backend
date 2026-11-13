'use strict';

const { isDeepStrictEqual } = require('util');
const { Op, QueryTypes } = require('sequelize');
const { sequelize, SyncJob, SyncFailure, SyncConflict, Company, Sector, Industry } = require('../models');
const sync = require('../lib/sync');
const co = require('../lib/adminCompanies');
const hist = require('../lib/adminHistory');
const { can } = require('../lib/adminRoles');
const { audit } = require('../lib/audit');
const companies = require('../lib/companies');
const { fail } = require('../lib/http');

const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));
// Same includes as the company editor, so columnsToForm sees sector/industry.
const companyRefs = [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: Industry, as: 'industry', attributes: ['name'] }];
const listingOf = (row) => ({ listingBoard: row.listingBoard == null ? null : row.listingBoard, listedYear: row.listedYear == null ? null : row.listedYear });
// What a BEI card is compared against: the team's working copy (draft, else live) plus the listing columns.
const formOf = (row) => ({ ...(row.draft || co.columnsToForm(row)), listing: listingOf(row) });
const FORBIDDEN = 'Peran Anda tidak punya izin untuk aksi ini.'; // COPY: perlu review

// ---- admin ----

// GET /admin/api/sync — AdminSinkron: jobs, open failures, open conflicts, 14-day failure history.
exports.index = async (req, res, next) => {
  try {
    const now = new Date();
    const [jobs, failures, conflicts, history, companies] = await Promise.all([
      SyncJob.findAll({ order: [['position', 'ASC'], ['key', 'ASC']] }),
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

// Approve (bei) or reject (team) one card inside `transaction`. Returns null when another admin got there first,
// else the audit entry to write. Approve writes to the LIVE profile (customers see it) and into an open draft, so
// publishing that draft doesn't undo it; the section is BEI's again. Reject keeps ours; the same BEI value is not raised again.
async function resolveOne(req, c, use, transaction) {
  const [claimed] = await SyncConflict.update({ resolvedAt: new Date(), resolution: use, resolvedById: req.admin.id }, { where: { id: c.id, resolvedAt: null }, transaction });
  if (!claimed) return null;
  const entry = { summary: { verb: use === 'bei' ? 'menyetujui data BEI untuk' : 'menolak data BEI untuk', target: c.ticker, rest: `· ${c.field}` } }; // COPY: perlu review
  if (use === 'team') return entry;
  const row = await Company.findByPk(c.ticker, { include: companyRefs, transaction, lock: { level: transaction.LOCK.UPDATE, of: Company } });
  const upd = { teamSections: sync.withoutSection(row.teamSections, c.section) };
  if (c.section === 'listing') {
    const before = { listing: listingOf(row) };
    const after = { listing: sync.withBei(before, 'listing', c.value) };
    Object.assign(upd, after.listing);
    entry.changes = hist.diffSections(before, after, ['listing']);
  } else {
    const live = co.columnsToForm(row);
    const next = { ...live, [c.section]: sync.withBei(live, c.section, c.value) };
    Object.assign(upd, co.formToColumns(next, row), { updatedByName: req.admin.name });
    if (row.draft) upd.draft = { ...row.draft, [c.section]: sync.withBei(row.draft, c.section, c.value) };
    const ch = hist.sectionChange(live, { [c.section]: next[c.section] });
    entry.changes = ch.changes;
    // Riwayat "Kembalikan" restores via a draft; only safe when no other draft was open.
    if (ch.keys.length && !row.draft) entry.revert = { type: 'company_sections', ref: c.ticker, before: ch.beforePart, after: ch.afterPart };
  }
  await row.update(upd, { transaction });
  return entry;
}

const checkUse = (req, res) => {
  const use = req.body && req.body.use;
  if (use !== 'bei' && use !== 'team') return void fail(res, 422, 'VALIDATION', sync.MSG.badChoice, { use: sync.MSG.badChoice });
  // Approving puts data live, so it needs the same right as "Terbitkan".
  if (use === 'bei' && !can(req.adminPerms, 'em', 'publish')) return void fail(res, 403, 'FORBIDDEN', FORBIDDEN);
  return use;
};

// POST /admin/api/sync/conflicts/:id/resolve { use: 'bei' | 'team' } — "Pakai data BEI" / "Pertahankan isian tim".
exports.resolve = async (req, res, next) => {
  const use = checkUse(req, res);
  if (!use) return;
  try {
    const c = isUuid(req.params.id) && (await SyncConflict.findByPk(req.params.id));
    if (!c) return fail(res, 404, 'NOT_FOUND', sync.MSG.conflictNotFound);
    const entry = await sequelize.transaction((t) => resolveOne(req, c, use, t));
    if (!entry) return fail(res, 409, 'ALREADY_RESOLVED', sync.MSG.conflictDone);
    await audit(req, 'sync_conflict_resolved', c.ticker, entry);
    res.json({ message: use === 'bei' ? sync.MSG.usedBei(c.ticker) : sync.MSG.keptTeam(c.ticker) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/sync/conflicts/resolve { use, ids?: [uuid] } — bulk "Setujui semua" / "Tolak semua". No ids = every open card.
// Each card is its own transaction and its own Riwayat entry. Cards already resolved by someone else are skipped.
exports.resolveMany = async (req, res, next) => {
  const use = checkUse(req, res);
  if (!use) return;
  const ids = req.body.ids;
  if (ids !== undefined && (!Array.isArray(ids) || !ids.length || ids.length > sync.MAX_BULK || !ids.every(isUuid))) {
    return fail(res, 422, 'VALIDATION', `Pilih 1–${sync.MAX_BULK} perubahan.`, { ids: 'Daftar id tidak valid.' }); // COPY: perlu review
  }
  try {
    const cards = await SyncConflict.findAll({ where: { resolvedAt: null, ...(ids && { id: ids }) }, order: [['ticker', 'ASC']], limit: sync.MAX_BULK });
    let resolved = 0;
    for (const c of cards) {
      const entry = await sequelize.transaction((t) => resolveOne(req, c, use, t));
      if (!entry) continue;
      await audit(req, 'sync_conflict_resolved', c.ticker, entry);
      resolved += 1;
    }
    res.json({ resolved, skipped: cards.length - resolved, message: sync.MSG.bulk(use, resolved) });
  } catch (err) {
    next(err);
  }
};

// ---- crawler (Bearer SYNC_TOKEN) ----

// Opens (or refreshes) the review card for one BEI section. Returns false when there is nothing to review:
// the team already has the same value, or already chose to keep theirs over this exact BEI value.
async function raiseConflict(c, company, jobKey, transaction) {
  const current = formOf(company);
  const open = await SyncConflict.findOne({ where: { ticker: c.ticker, section: c.section, resolvedAt: null }, transaction });
  const same = isDeepStrictEqual(current[c.section], sync.withBei(current, c.section, c.value));
  const last = !open && !same && (await SyncConflict.findOne({ where: { ticker: c.ticker, section: c.section, resolvedAt: { [Op.ne]: null } }, order: [['resolvedAt', 'DESC']], transaction }));
  if (same || sync.alreadyKept(last, c.value)) {
    if (open && same) await open.update({ resolvedAt: new Date(), resolution: 'same' }, { transaction }); // team caught up meanwhile
    return false;
  }
  if (open) await open.update({ jobKey, field: c.field, reason: c.reason, value: c.value }, { transaction });
  else await SyncConflict.create({ ...c, jobKey }, { transaction });
  return true;
}

// One company from the crawler. Nothing is written to the company: every section that differs from ours becomes a
// card in AdminSinkron and goes live only when an admin approves it ("Pakai data BEI").
async function ingestCompany(d, ticker, transaction) {
  const row = await Company.findByPk(ticker, { include: companyRefs, transaction });
  if (!row) return { ticker, status: 'unknown' };
  const current = formOf(row);
  const { sections, columns, errors } = sync.fromCrawler(d, current);
  if (errors) return { ticker, status: 'invalid', errors };
  if (row.status !== 'ipo' && Object.keys(columns).length) sections.listing = columns; // IPO rows get their board from the IPO form
  const review = [];
  for (const { section, reason } of sync.pendingSections(current, row.teamSections, sections)) {
    const { job, field } = sync.BEI_SECTIONS[section];
    if (await raiseConflict({ ticker, section, field, reason, value: sections[section] }, row, job, transaction)) review.push(section);
  }
  return { ticker, status: review.length ? 'review' : 'unchanged', review };
}

// POST /admin/api/sync/agent/companies { data: <crawler object> | [<crawler object>, …] } — raw IDX profile JSON, max 100 per call.
// Each company is its own transaction, so one bad row doesn't drop the rest. Run status still goes through /report.
exports.companies = async (req, res, next) => {
  const raw = req.body && req.body.data;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (!list.length || list.length > sync.MAX_COMPANIES) return fail(res, 422, 'VALIDATION', `Kirim 1–${sync.MAX_COMPANIES} emiten di "data".`, { data: 'Objek atau daftar.' });
  try {
    const results = [];
    for (const d of list) {
      const ticker = companies.normTicker(d && d.ticker);
      if (!companies.isTicker(ticker)) { results.push({ ticker: ticker || null, status: 'invalid', errors: { ticker: 'Ticker tidak valid.' } }); continue; }
      results.push(await sequelize.transaction((t) => ingestCompany(d, ticker, t)));
    }
    const count = (st) => results.filter((r) => r.status === st).length;
    // `updated` stays for older crawler builds; it is always 0 now that BEI data waits for approval.
    res.json({ updated: 0, review: count('review'), unchanged: count('unchanged'), unknown: count('unknown'), invalid: count('invalid'), results });
  } catch (err) {
    next(err);
  }
};

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
        if (await raiseConflict(c, company, job.key, transaction)) out.conflicts += 1;
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
