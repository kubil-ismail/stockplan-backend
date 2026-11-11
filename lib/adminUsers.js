'use strict';

// Pure logic for the admin "Pengguna" page (AdminPengguna).
const { checkEmail, normEmail } = require('./auth');
const { cell } = require('./adminCompanies');

const IDLE_DAYS = 30; // shortcut: "Tidak aktif" = no activity for 30 days (not in design), upgrade: confirm with product
const DAY = 24 * 60 * 60 * 1000;

// Keep in sync with statusOf(): the list filters/counts in SQL, the row badge is computed in JS.
const STATUS_SQL = `CASE WHEN "suspendedAt" IS NOT NULL THEN 'sus' WHEN NOT "emailVerified" THEN 'new' WHEN COALESCE("lastActiveAt", "createdAt") < NOW() - INTERVAL '${IDLE_DAYS} days' THEN 'idle' ELSE 'act' END`;
const STATUSES = { act: 'Aktif', new: 'Belum konfirmasi', idle: 'Tidak aktif', sus: 'Ditangguhkan' };

function statusOf(u, now = Date.now()) {
  if (u.suspendedAt) return 'sus';
  if (!u.emailVerified) return 'new';
  const last = new Date(u.lastActiveAt || u.createdAt).getTime();
  return now - last > IDLE_DAYS * DAY ? 'idle' : 'act';
}

// "Minat paket": y Tahunan, m Bulanan, n Belum memilih (plan `beta` = belum memilih).
const PLANS = { y: { plan: 'yearly', label: 'Tahunan', full: 'Tahunan · Rp790.000/tahun' }, m: { plan: 'monthly', label: 'Bulanan', full: 'Bulanan · Rp79.000/bulan' }, n: { plan: 'beta', label: '—', full: 'Belum memilih' } };
const planKey = (plan) => Object.keys(PLANS).find((k) => PLANS[k].plan === plan) || 'n';

const REASONS = ['Spam atau akun palsu', 'Menyalahgunakan form laporan', 'Permintaan pengguna sendiri', 'Lainnya'];
const NOTE_MAX = 500;
const MSG = {
  reasonRequired: 'Pilih alasan dulu',
  reasonInvalid: 'Alasan tidak dikenal.', // COPY: perlu review
  noteLong: `Catatan maksimal ${NOTE_MAX} karakter.`, // COPY: perlu review
  emailInvalid: 'Email belum valid',
  alreadySuspended: 'Akun sudah ditangguhkan.', // COPY: perlu review
  notSuspended: 'Akun tidak sedang ditangguhkan.', // COPY: perlu review
  alreadyVerified: 'Email sudah terkonfirmasi.', // COPY: perlu review
  cannotReset: 'Atur ulang password hanya untuk akun terkonfirmasi yang tidak ditangguhkan.', // COPY: perlu review
  notFound: 'Pengguna tidak ditemukan.', // COPY: perlu review
};

function validateSuspend(body = {}) {
  const reason = typeof body.reason === 'string' ? body.reason : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const errors = {};
  if (!reason) errors.reason = MSG.reasonRequired;
  else if (!REASONS.includes(reason)) errors.reason = MSG.reasonInvalid;
  if (note.length > NOTE_MAX) errors.note = MSG.noteLong;
  return { values: { reason, note }, errors: Object.keys(errors).length ? errors : null };
}

function validateInvite(body = {}) {
  const email = normEmail(body.email);
  return { values: { email }, errors: checkEmail(email) ? { email: MSG.emailInvalid } : null };
}

// "Chrome · Windows" from a User-Agent. Order matters: Edge/Opera/Chrome all say Chrome, iPhone says Mac.
function deviceLabel(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null;
  const os = /Android/.test(ua) ? 'Android' : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return [browser, os].filter(Boolean).join(' · ') || 'Perangkat tidak dikenal';
}

function listRow(u, now = Date.now()) {
  const status = statusOf(u, now);
  return {
    id: u.id, name: u.name, email: u.email,
    status, statusLabel: STATUSES[status],
    lastActiveAt: u.lastActiveAt || null, // null = "Belum pernah masuk"
    theses: 0, // shortcut: Tesis module not built, upgrade: count per user
    plan: { key: planKey(u.plan), label: PLANS[planKey(u.plan)].label },
    joinedAt: u.createdAt,
  };
}

// sessions: recent AuthSession rows (userAgent, updatedAt). watchlistCount from watchlist_items.
function detailView(u, { sessions = [], watchlistCount = 0 } = {}, now = Date.now()) {
  const pk = planKey(u.plan);
  const status = statusOf(u, now);
  return {
    ...listRow(u, now),
    account: {
      joinedAt: u.createdAt,
      loginMethod: 'Email', // shortcut: Google sign-in not built
      emailVerified: u.emailVerified,
      subscription: 'Akses beta · gratis',
      planInterest: PLANS[pk].full + (pk !== 'n' ? ' · minta diingatkan' : ''),
    },
    // Admin only sees counts (design note): never the content of theses, portfolio or watchlist.
    usage: { theses: 0, evaluations: 0, watchlist: watchlistCount, themesOpened: null },
    recentLogins: sessions.map((s) => ({ device: deviceLabel(s.userAgent), at: s.updatedAt })),
    feedback: [], // shortcut: Masukan & laporan not built
    suspension: u.suspendedAt ? { at: u.suspendedAt, reason: u.suspendReason, note: u.suspendNote || '', by: u.suspendedBy || null } : null,
    actions: {
      resendConfirmation: !u.emailVerified,
      resetPassword: u.emailVerified && !u.suspendedAt,
      suspend: status !== 'sus',
      restore: status === 'sus',
    },
  };
}

function toCsv(rows) {
  const head = ['Nama', 'Email', 'Bergabung', 'Terakhir aktif', 'Status', 'Tesis', 'Minat paket'];
  const lines = rows.map((r) => [r.name, r.email, new Date(r.joinedAt).toISOString(), r.lastActiveAt ? new Date(r.lastActiveAt).toISOString() : '', r.statusLabel, r.theses, r.plan.label].map(cell).join(','));
  return `${[head.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}

module.exports = { IDLE_DAYS, STATUS_SQL, STATUSES, PLANS, REASONS, MSG, statusOf, planKey, validateSuspend, validateInvite, deviceLabel, listRow, detailView, toCsv };
