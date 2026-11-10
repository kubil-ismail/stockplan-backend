'use strict';

// Options and copy from design/screens/Profil.dc.html.
const EXPERIENCE = ['Baru mulai', '< 1 tahun', '1–3 tahun', '> 3 tahun'];
const HORIZON = ['1–3 tahun', '3–5 tahun', 'Lebih dari 5 tahun'];

const MSG = {
  nameRequired: 'Nama tidak boleh kosong.',
  tooLong: 'Isian terlalu panjang.', // COPY: perlu review
  invalid: 'Pilihan tidak valid.', // COPY: perlu review
  currentRequired: 'Isi password Anda sekarang.',
  currentWrong: 'Password sekarang salah.', // COPY: perlu review
  newWeak: 'Password baru minimal 8 karakter dengan huruf dan angka.',
  mismatch: 'Kedua password baru belum sama.',
};

const str = (v) => (typeof v === 'string' ? v : '');

// PATCH /me: only fields present in the body are validated and returned in `values`.
function validateProfile(body = {}) {
  const values = {};
  const errors = {};
  if ('name' in body) {
    const name = str(body.name).trim();
    if (!name) errors.name = MSG.nameRequired;
    else if (name.length > 100) errors.name = MSG.tooLong;
    else values.name = name;
  }
  if ('experience' in body) {
    if (EXPERIENCE.includes(body.experience)) values.experience = body.experience;
    else errors.experience = MSG.invalid;
  }
  if ('horizon' in body) {
    if (HORIZON.includes(body.horizon)) values.horizon = body.horizon;
    else errors.horizon = MSG.invalid;
  }
  if ('interestedThemes' in body) {
    const t = body.interestedThemes;
    if (Array.isArray(t) && t.length <= 20 && t.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 60)) {
      values.interestedThemes = [...new Set(t)];
    } else errors.interestedThemes = MSG.invalid;
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

function validatePasswordChange(body = {}) {
  const current = str(body.currentPassword);
  const next = str(body.newPassword);
  const errors = {};
  if (!current) errors.currentPassword = MSG.currentRequired;
  if (next.length > 128 || next.length < 8 || !/[0-9]/.test(next) || !/[a-zA-Z]/.test(next)) errors.newPassword = MSG.newWeak;
  else if (next !== str(body.confirmPassword)) errors.confirmPassword = MSG.mismatch;
  return { values: { current, next }, errors: Object.keys(errors).length ? errors : null };
}

// "Chrome di macOS" label for the device list.
function deviceLabel(ua = '') {
  const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Peramban';
  const os = /iPhone|iPad|iOS/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : null;
  return os ? `${browser} di ${os}` : browser;
}

module.exports = { EXPERIENCE, HORIZON, MSG, validateProfile, validatePasswordChange, deviceLabel };
