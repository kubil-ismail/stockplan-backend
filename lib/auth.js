'use strict';

const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Copy from design/screens/Register.dc.html and Login.dc.html.
const MSG = {
  nameRequired: 'Isi nama panggilan Anda.',
  emailRequired: 'Isi email Anda.',
  emailFormat: 'Format email belum benar. Contoh: nama@email.com',
  emailTaken: 'Email ini sudah terdaftar.',
  passwordRequired: 'Isi password Anda.',
  passwordWeak: 'Password minimal 8 karakter, dengan huruf besar dan angka.', // COPY: perlu review
  tooLong: 'Isian terlalu panjang.', // COPY: perlu review
  agreeRequired: 'Centang kedua pernyataan di atas untuk melanjutkan.',
  badCredentials: 'Email atau password tidak cocok.',
  unconfirmed: 'Email Anda belum dikonfirmasi.',
  sameEmail: 'Ini sudah menjadi email akun Anda.', // COPY: perlu review
  badToken: 'Link konfirmasi tidak valid atau sudah kedaluwarsa.', // COPY: perlu review
  confirmDelete: 'Ketik HAPUS untuk konfirmasi.', // COPY: perlu review
};

const str = (v) => (typeof v === 'string' ? v : '');
const normEmail = (v) => str(v).trim().toLowerCase();

function checkEmail(email) {
  if (!email) return MSG.emailRequired;
  if (email.length > 254) return MSG.tooLong;
  if (!EMAIL_RE.test(email)) return MSG.emailFormat;
  return null;
}

// Returns { values, errors } — errors is null when valid.
function validateRegister(body = {}) {
  const values = { name: str(body.name).trim(), email: normEmail(body.email), password: str(body.password) };
  const errors = {};
  if (!values.name) errors.name = MSG.nameRequired;
  else if (values.name.length > 100) errors.name = MSG.tooLong;
  const em = checkEmail(values.email);
  if (em) errors.email = em;
  const pw = values.password;
  if (pw.length > 128) errors.password = MSG.tooLong;
  else if (!(pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw))) errors.password = MSG.passwordWeak;
  // Both checkboxes: Syarat layanan + "bukan saran investasi".
  if (body.agreeTerms !== true || body.agreeNotAdvice !== true) errors.agree = MSG.agreeRequired;
  return { values, errors: Object.keys(errors).length ? errors : null };
}

function validateLogin(body = {}) {
  const values = { email: normEmail(body.email), password: str(body.password), remember: body.remember !== false };
  const errors = {};
  const em = checkEmail(values.email);
  if (em) errors.email = em;
  if (!values.password) errors.password = MSG.passwordRequired;
  else if (values.password.length > 128) errors.password = MSG.tooLong;
  return { values, errors: Object.keys(errors).length ? errors : null };
}

// Format: scrypt$<salt hex>$<hash hex>
async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [, saltHex, hashHex] = String(stored).split('$');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

const newSessionToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { checkEmail, normEmail, MSG, validateRegister, validateLogin, hashPassword, verifyPassword, newSessionToken, hashToken };
