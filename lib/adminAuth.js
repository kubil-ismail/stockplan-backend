'use strict';

const crypto = require('crypto');
const { normEmail } = require('./auth');

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const PENDING_TTL = 5 * 60 * 1000; // between step 1 and step 2
const IDLE_TTL = 30 * 60 * 1000; // HANDOFF §8.1
const TRUST_TTL = 7 * 24 * 60 * 60 * 1000;

// Copy from design/screens/AdminLogin.dc.html and AdminLogin2FA.dc.html.
const MSG = {
  workEmail: 'Gunakan email kerja @stockplan.id.',
  passwordRequired: 'Isi password Anda.', // COPY: perlu review
  badCredentials: (left) => `Email atau password salah. Sisa ${left} percobaan sebelum akun dikunci.`,
  locked: 'Terlalu banyak percobaan. Akun dikunci 15 menit dan super admin sudah diberi tahu.',
  otpFormat: 'Kode harus 6 digit angka.',
  backupFormat: 'Format kode cadangan: xxxx-xxxx.',
  otpWrong: 'Kode salah atau sudah kedaluwarsa. Coba kode terbaru.',
  backupWrong: 'Kode cadangan salah atau sudah terpakai.', // COPY: perlu review
  noPending: 'Sesi masuk berakhir. Mulai lagi dari email dan password.', // COPY: perlu review
  unauthenticated: 'Sesi admin berakhir. Masuk lagi.', // COPY: perlu review
};

const str = (v) => (typeof v === 'string' ? v : '');

function validateLogin(body = {}) {
  const values = { email: normEmail(body.email), password: str(body.password) };
  const errors = {};
  if (!/^[^\s@]+@stockplan\.id$/.test(values.email)) errors.email = MSG.workEmail;
  if (!values.password) errors.password = MSG.passwordRequired;
  else if (values.password.length > 128) errors.password = MSG.passwordRequired;
  return { values, errors: Object.keys(errors).length ? errors : null };
}

function validateVerify(body = {}) {
  const method = body.method === 'backup' ? 'backup' : 'totp';
  const code = str(body.code).trim();
  const ok = method === 'backup' ? /^[a-z0-9]{4}-[a-z0-9]{4}$/i.test(code) : /^\d{6}$/.test(code);
  const values = { method, code: method === 'backup' ? code.toLowerCase() : code, trustDevice: body.trustDevice === true };
  return { values, errors: ok ? null : { code: method === 'backup' ? MSG.backupFormat : MSG.otpFormat } };
}

// Failures are counted from the audit log (login_failed / twofa_failed for the email,
// since the last success), so unknown emails behave exactly like real ones.
function lockState(failTimes, now = Date.now()) {
  const recent = failTimes.filter((t) => now - t < LOCK_MS).sort((a, b) => a - b);
  if (recent.length < MAX_FAILS) return { locked: false, left: MAX_FAILS - recent.length };
  return { locked: true, left: 0, until: new Date(recent[MAX_FAILS - 1] + LOCK_MS) };
}

const newBackupCodes = (n = 8) =>
  Array.from({ length: n }, () => {
    const h = crypto.randomBytes(4).toString('hex');
    return `${h.slice(0, 4)}-${h.slice(4)}`;
  });

const hashCode = (c) => crypto.createHash('sha256').update(c.toLowerCase()).digest('hex');

module.exports = { MAX_FAILS, LOCK_MS, PENDING_TTL, IDLE_TTL, TRUST_TTL, MSG, validateLogin, validateVerify, lockState, newBackupCodes, hashCode };
