'use strict';

// Pure logic for "Sinkron data BEI" (AdminSinkron): crawler report validation, job/failure/conflict views, 14-day history.
const { isDeepStrictEqual } = require('util');
const { validateForm } = require('./adminCompanies');
const { diffSections } = require('./adminHistory');
const { jakartaDate, normTicker, isTicker } = require('./companies');

// A run that never reported back counts as dead after this; the job can be claimed again.
const RUN_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const HISTORY_DAYS = 14;
// shortcut: only BEI-owned sections may raise conflicts (design examples: anak usaha, manajemen, kepemilikan);
// add more here once the crawler maps them, and check the section needs no extra refs (sector) before applying.
const SECTIONS = ['group', 'shareholders', 'management'];
const MAX = { failures: 2000, conflicts: 500, tickers: 2000 };

const MSG = {
  jobNotFound: 'Jadwal sinkron tidak ditemukan.', // COPY: perlu review
  failureNotFound: 'Kegagalan ini sudah tidak ada.', // COPY: perlu review
  conflictNotFound: 'Perubahan ini tidak ditemukan.', // COPY: perlu review
  conflictDone: 'Perubahan ini sudah ditinjau.', // COPY: perlu review
  badChoice: 'Pilih data BEI atau isian tim.', // COPY: perlu review
  queued: (name) => `${name} masuk antrean sinkron.`, // COPY: perlu review
  queuedAll: 'Semua sinkron masuk antrean.', // COPY: perlu review
  retry: (tk) => `${tk} masuk antrean sinkron ulang.`, // COPY: perlu review
  usedBei: (tk) => `${tk}: data BEI dipakai dan tercatat di Riwayat perubahan`,
  keptTeam: (tk) => `${tk}: isian tim dipertahankan`,
  bulk: (use, n) => (use === 'bei' ? `${n} perubahan BEI disetujui dan tercatat di Riwayat perubahan` : `${n} perubahan BEI ditolak`), // COPY: perlu review
};

// 72_000 -> "1 mnt 12 dtk"; 38_000 -> "38 dtk"
function durationLabel(ms) {
  if (ms === null || ms === undefined || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} dtk`;
  return s % 60 ? `${Math.floor(s / 60)} mnt ${s % 60} dtk` : `${s / 60} mnt`;
}

// "958 emiten · 1 mnt 12 dtk" / "955 dari 958 · 41 dtk" / "14 dokumen baru"
function runSummary(job) {
  if (!job.lastFinishedAt) return '';
  if (job.lastDetail) return job.lastDetail;
  const count = job.lastTotal == null ? '' : job.lastOk === job.lastTotal ? `${job.lastTotal} emiten` : `${job.lastOk} dari ${job.lastTotal}`;
  const dur = job.lastStartedAt ? durationLabel(new Date(job.lastFinishedAt) - new Date(job.lastStartedAt)) : '';
  return [count, dur].filter(Boolean).join(' · ');
}

const isRunning = (job, now) => !!job.runningSince && now - new Date(job.runningSince) < RUN_TIMEOUT_MS;

// status: running | queued | failed | ok | never
function jobView(job, { openFails = 0, openConflicts = 0, now = new Date() } = {}) {
  const status = isRunning(job, now) ? 'running' : job.requestedAt ? 'queued' : openFails ? 'failed' : job.lastFinishedAt ? 'ok' : 'never';
  return {
    key: job.key, name: job.name, description: job.description, schedule: job.schedule, nextRunAt: job.nextRunAt || null,
    lastStartedAt: job.lastStartedAt || null, lastFinishedAt: job.lastFinishedAt || null, summary: runSummary(job),
    note: openConflicts ? `${openConflicts} perubahan perlu ditinjau` : job.note || '',
    status, failed: openFails,
  };
}

// A failure is being retried while its job is queued/running for all tickers or for this ticker.
function failureView(f, job, now = new Date()) {
  const pending = !!job && (isRunning(job, now) || !!job.requestedAt);
  const scope = job && job.requestedTickers;
  return {
    id: f.id, jobKey: f.jobKey, jobName: job ? job.name : f.jobKey, ticker: f.ticker || null, message: f.message, log: f.log, at: f.createdAt,
    retrying: pending && (!scope || !f.ticker || scope.includes(f.ticker)),
  };
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
// The section as it would be after "Pakai data BEI": BEI keys over the team's current section.
const withBei = (current, section, value) => (isObj(value) && isObj(current[section]) ? { ...current[section], ...value } : value);

// current = the company form (draft or live). changes = leaf rows "Di StockPlan" vs "Dari BEI".
const conflictView = (c, current) => ({
  id: c.id, jobKey: c.jobKey, ticker: c.ticker, section: c.section, field: c.field, reason: c.reason, at: c.updatedAt,
  changes: diffSections(current, { [c.section]: withBei(current, c.section, c.value) }, [c.section]),
});

// Same BEI value the team already chose to keep → don't raise it again every day.
const alreadyKept = (lastResolved, value) => !!lastResolved && lastResolved.resolution === 'team' && isDeepStrictEqual(lastResolved.value, value);

// "Jalankan sekarang" (tickers = null) widens any pending retry to a full run; "Coba lagi" adds a ticker unless a full run is pending.
function mergeRequest(job, tickers) {
  if (!tickers) return null;
  if (job.requestedAt && !job.requestedTickers) return null;
  return [...new Set([...(job.requestedAt ? job.requestedTickers || [] : []), ...tickers])];
}

// [{ day: '2026-11-06', n: 3 }] -> 14 entries oldest first, ending today (Asia/Jakarta); missing days = 0.
function historyDays(rows, now = new Date()) {
  const byDay = Object.fromEntries(rows.map((r) => [r.day, Number(r.n)]));
  const today = new Date(`${jakartaDate(now)}T00:00:00Z`);
  return Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const date = new Date(today - (HISTORY_DAYS - 1 - i) * 86400000).toISOString().slice(0, 10);
    return { date, failed: byDay[date] || 0 };
  });
}

// ---- crawler company data (raw IDX profile JSON from stock-plan-crawler) ----
// Section -> job that owns it (conflicts are listed under that job) + label for the conflict card.
// All of it comes from one scrape of the company profile, so every card belongs to the job `prof`.
// `listing` is not a form section: it holds the listingBoard/listedYear columns.
const PROFILE_JOB = 'prof';
const BEI_SECTIONS = {
  management: { job: PROFILE_JOB, field: 'Direksi dan komisaris' }, // COPY: perlu review
  shareholders: { job: PROFILE_JOB, field: 'Pemegang saham' }, // COPY: perlu review
  group: { job: PROFILE_JOB, field: 'Anak usaha' }, // COPY: perlu review
  listing: { job: PROFILE_JOB, field: 'Papan dan tahun tercatat' }, // COPY: perlu review
};
const TEAM_REASON = 'Bagian ini sudah pernah diatur tim, jadi tidak ditimpa otomatis.';
const NEW_REASON = 'Data baru dari BEI. Belum tampil di aplikasi sampai disetujui.'; // COPY: perlu review
const MAX_COMPANIES = 100;
const MAX_BULK = 500;
const cut = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const pct = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v * 10000) / 10000)) : null);
const nonEmpty = (v) => Array.isArray(v) && v.length > 0;

// d = one crawler `data` object; current = the company form (keeps team-set subsidiary `ticker`/`show` by name).
// Empty lists are treated as "no data" (a parser miss must not wipe a section). Returns { sections, columns, errors }.
function fromCrawler(d, current = {}) {
  const sections = {};
  if (nonEmpty(d.commissioners) || nonEmpty(d.directors)) {
    sections.management = { people: [...(d.commissioners || []), ...(d.directors || [])].filter((p) => p && cut(p.name, 100)).slice(0, 30)
      .map((p) => ({ name: cut(p.name, 100), role: cut(p.position && p.position.id, 100) })) };
  }
  if (nonEmpty(d.shareholders)) {
    // "Masyarakat …" rows are the public float; the page computes "Publik (free float)" from the rest.
    sections.shareholders = { items: d.shareholders.filter((s) => s && cut(s.name, 100) && !/^masyarakat/i.test(cut(s.type && s.type.id, 60)) && pct(s.percentage) > 0)
      .sort((a, b) => b.percentage - a.percentage).slice(0, 20).map((s) => ({ name: cut(s.name, 100), pct: pct(s.percentage) })) };
  }
  if (nonEmpty(d.subsidiaries)) {
    const prev = new Map(((current.group && current.group.subsidiaries) || []).map((x) => [x.name.toLowerCase(), x]));
    // shortcut: the form holds 30 subsidiaries, so only the 30 largest by total assets are kept; raise the form limit if the page needs all.
    sections.group = { subsidiaries: d.subsidiaries.filter((x) => x && cut(x.name, 100)).sort((a, b) => (b.total_assets || 0) - (a.total_assets || 0)).slice(0, 30)
      .map((x) => {
        const name = cut(x.name, 100);
        const old = prev.get(name.toLowerCase());
        const kind = x.type && x.type.id;
        return { name, business: cut(Array.isArray(kind) ? kind.join(', ') : kind, 200), ownershipPct: pct(x.ownership_percentage), ticker: old ? old.ticker : '', show: old ? old.show : true };
      }) };
  }
  const columns = {};
  if (d.board && cut(d.board.name, 40)) columns.listingBoard = cut(d.board.name, 40);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d.ipo_date || '')) columns.listedYear = Number(d.ipo_date.slice(0, 4));

  const v = validateForm(sections);
  // validateForm fills defaults (group.name = ''); keep only what BEI sent so withBei leaves the rest to the team.
  const out = Object.fromEntries(Object.entries(v.values).map(([k, val]) => [k, Object.fromEntries(Object.keys(sections[k]).map((f) => [f, val[f]]))]));
  return { sections: out, columns, errors: v.errors };
}

// Every BEI section that differs from ours waits for approval. Returns [{ section, reason }]; unchanged sections are dropped.
function pendingSections(current, teamSections, sections) {
  return Object.entries(sections)
    .filter(([k, value]) => !isDeepStrictEqual(current[k], withBei(current, k, value)))
    .map(([k]) => ({ section: k, reason: (teamSections || []).includes(k) ? TEAM_REASON : NEW_REASON }));
}

// teamSections bookkeeping: add on team edits, drop when the team hands a section back to BEI.
const withSections = (list, keys) => [...new Set([...(list || []), ...keys])];
const withoutSection = (list, key) => (list || []).filter((k) => k !== key);

// ---- crawler report ----
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const date = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
};
const count = (v) => (v === undefined || v === null ? null : Number.isInteger(v) && v >= 0 ? v : undefined);

// POST /admin/api/sync/agent/jobs/:key/report. Returns { report, errors }.
// tickers: null = full run (updates "Terakhir"), array = retry of only those tickers.
function validateReport(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const report = {
    startedAt: date(b.startedAt), finishedAt: date(b.finishedAt), nextRunAt: date(b.nextRunAt),
    ok: count(b.ok), total: count(b.total), detail: str(b.detail, 120) || null, note: str(b.note, 120) || null,
    tickers: null, failures: [], conflicts: [],
  };
  for (const k of ['startedAt', 'finishedAt', 'nextRunAt']) if (report[k] === undefined) errors[k] = 'Tanggal tidak valid.';
  if (!report.startedAt) errors.startedAt = errors.startedAt || 'Wajib diisi.';
  if (!report.finishedAt) errors.finishedAt = errors.finishedAt || 'Wajib diisi.';
  if (report.startedAt && report.finishedAt && report.finishedAt < report.startedAt) errors.finishedAt = 'Harus setelah startedAt.';
  for (const k of ['ok', 'total']) if (report[k] === undefined) errors[k] = 'Harus bilangan bulat ≥ 0.';
  if (report.ok != null && report.total != null && report.ok > report.total) errors.ok = 'Tidak boleh lebih dari total.';

  if (b.tickers !== undefined && b.tickers !== null) {
    if (!Array.isArray(b.tickers) || b.tickers.length > MAX.tickers) errors.tickers = `Daftar ticker, maks. ${MAX.tickers}.`;
    else {
      report.tickers = [...new Set(b.tickers.map(normTicker))];
      if (!report.tickers.every(isTicker)) errors.tickers = 'Ada ticker tidak valid.';
    }
  }

  const failures = b.failures === undefined ? [] : b.failures;
  if (!Array.isArray(failures) || failures.length > MAX.failures) errors.failures = `Daftar, maks. ${MAX.failures}.`;
  else failures.forEach((f, i) => {
    const ticker = f && f.ticker ? normTicker(f.ticker) : null;
    const message = str(f && f.message, 200);
    if (ticker && !isTicker(ticker)) errors[`failures[${i}].ticker`] = 'Ticker tidak valid.';
    if (!message) errors[`failures[${i}].message`] = 'Wajib diisi.';
    report.failures.push({ ticker, message, log: str(f && f.log, 500) });
  });

  const conflicts = b.conflicts === undefined ? [] : b.conflicts;
  if (!Array.isArray(conflicts) || conflicts.length > MAX.conflicts) errors.conflicts = `Daftar, maks. ${MAX.conflicts}.`;
  else conflicts.forEach((c, i) => {
    const p = `conflicts[${i}]`;
    const ticker = normTicker(c && c.ticker);
    const section = c && c.section;
    if (!isTicker(ticker)) errors[`${p}.ticker`] = 'Ticker tidak valid.';
    if (!SECTIONS.includes(section)) { errors[`${p}.section`] = `Harus salah satu: ${SECTIONS.join(', ')}.`; return; }
    const field = str(c.field, 100);
    if (!field) errors[`${p}.field`] = 'Wajib diisi.';
    const v = validateForm({ [section]: c.value });
    if (v.errors) for (const [k, m] of Object.entries(v.errors)) errors[`${p}.value${k.slice(section.length)}`] = m;
    // Keep only the keys BEI sent, so e.g. subsidiaries alone don't blank the team's group name (see withBei).
    const sent = isObj(c.value) ? Object.keys(c.value) : [];
    const value = isObj(v.values[section]) ? Object.fromEntries(sent.filter((k) => k in v.values[section]).map((k) => [k, v.values[section][k]])) : v.values[section];
    report.conflicts.push({ ticker, section, field, reason: str(c.reason, 300), value });
  });

  return { report, errors: Object.keys(errors).length ? errors : null };
}

module.exports = {
  RUN_TIMEOUT_MS, HISTORY_DAYS, SECTIONS, MSG, BEI_SECTIONS, TEAM_REASON, MAX_COMPANIES, MAX_BULK,
  NEW_REASON, fromCrawler, pendingSections, withSections, withoutSection,
  durationLabel, runSummary, isRunning, jobView, failureView, withBei, conflictView, alreadyKept, mergeRequest, historyDays, validateReport,
};
