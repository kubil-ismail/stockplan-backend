'use strict';

// Pure logic for "Anggota tim" (AdminAkses).
const { normEmail } = require('./auth');
const { deviceLabel } = require('./adminUsers');
const { SUPER } = require('./adminRoles');

const INVITE_TTL = 72 * 60 * 60 * 1000; // "Berlaku 72 jam."
const PASSWORD_MIN = 10; // AdminLogin: "Minimal 10 karakter"
const STATUS = { active: 'Aktif', invited: 'Undangan', disabled: 'Nonaktif' };

const MSG = {
  workEmail: 'Gunakan email kerja @stockplan.id',
  emailTaken: 'Email ini sudah terdaftar sebagai anggota.', // COPY: perlu review
  roleUnknown: 'Peran tidak dikenal.', // COPY: perlu review
  self: 'Tidak bisa mengubah peran sendiri',
  selfStatus: 'Tidak bisa menonaktifkan akun sendiri.', // COPY: perlu review
  lastSuper: 'Harus ada minimal 1 super admin aktif',
  superOnly: 'Hanya super admin yang bisa memberi atau mencabut peran super admin.', // COPY: perlu review
  notInvited: 'Anggota ini tidak sedang diundang.', // COPY: perlu review
  notDisabled: 'Anggota ini tidak sedang nonaktif.', // COPY: perlu review
  notActive: 'Anggota ini tidak sedang aktif.', // COPY: perlu review
  badInvite: 'Tautan undangan tidak valid atau sudah kedaluwarsa.', // COPY: perlu review
  passwordShort: `Password minimal ${PASSWORD_MIN} karakter.`, // COPY: perlu review
  notFound: 'Anggota tidak ditemukan.', // COPY: perlu review
};

function validateInvite(body = {}) {
  const email = normEmail(body.email);
  const role = typeof body.role === 'string' ? body.role : '';
  const errors = {};
  if (!/^[^\s@]+@stockplan\.id$/.test(email)) errors.email = MSG.workEmail;
  if (!role) errors.role = MSG.roleUnknown;
  return { values: { email, role }, errors: Object.keys(errors).length ? errors : null };
}

// POST /admin/api/auth/accept-invite { token, password, name? }
function validateAccept(body = {}) {
  const token = typeof body.token === 'string' ? body.token : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const errors = {};
  if (password.length < PASSWORD_MIN || password.length > 128) errors.password = MSG.passwordShort;
  if (name.length > 100) errors.name = 'Isian terlalu panjang.'; // COPY: perlu review
  return { values: { token, password, name }, errors: Object.keys(errors).length ? errors : null };
}

// "rina.putri@stockplan.id" -> "Rina.putri" (design: first letter of the local part capitalised).
const nameFromEmail = (email) => email.split('@')[0].replace(/^./, (c) => c.toUpperCase());

// Guards for role/status changes. actor/target: AdminUser rows; activeSupers: count of active super admins.
// Returns an error message or null.
function roleChangeError(actor, target, newRole, activeSupers) {
  if (actor.id === target.id) return MSG.self;
  const touchesSuper = target.role === SUPER || newRole === SUPER;
  if (touchesSuper && actor.role !== SUPER) return MSG.superOnly;
  if (target.role === SUPER && newRole !== SUPER && target.status === 'active' && activeSupers <= 1) return MSG.lastSuper;
  return null;
}
function deactivateError(actor, target, activeSupers) {
  if (actor.id === target.id) return MSG.selfStatus;
  if (target.role === SUPER && actor.role !== SUPER) return MSG.superOnly;
  if (target.status !== 'active') return MSG.notActive;
  if (target.role === SUPER && activeSupers <= 1) return MSG.lastSuper;
  return null;
}

// lastLogin: { at, userAgent } | null from the audit log; failedToday: login/2FA failures since 00:00 WIB.
function memberView(m, { me, roleName, activeSupers, lastLogin = null, failedToday = 0, now = Date.now() }) {
  const isMe = m.id === me.id;
  const lastSuper = m.role === SUPER && m.status === 'active' && activeSupers <= 1;
  const inviteExpired = m.status === 'invited' && (!m.inviteExpiresAt || new Date(m.inviteExpiresAt).getTime() < now);
  return {
    id: m.id, name: m.name, email: m.email, me: isMe,
    role: { id: m.role, name: roleName },
    roleLocked: isMe || lastSuper,
    roleLockReason: isMe ? MSG.self : lastSuper ? 'Super admin terakhir' : null,
    // active = "✓ Aktif", pending = "Belum diatur" (invite not accepted), off = "✕ Belum"
    twoFactor: m.twoFactorEnabledAt ? 'active' : m.status === 'invited' ? 'pending' : 'off',
    lastLogin: lastLogin ? { at: lastLogin.at, device: deviceLabel(lastLogin.userAgent || '') } : null,
    failedToday,
    status: m.status, statusLabel: STATUS[m.status],
    invite: m.status === 'invited' ? { sentAt: m.invitedAt, expiresAt: m.inviteExpiresAt, expired: inviteExpired, by: m.invitedBy || null } : null,
    disabledAt: m.disabledAt || null,
    actions: {
      deactivate: !isMe && m.status === 'active' && !lastSuper,
      resendInvite: !isMe && m.status === 'invited',
      reactivate: !isMe && m.status === 'disabled',
    },
  };
}

// Start of today in Asia/Jakarta (UTC+7, no DST), for "3 gagal masuk pagi ini".
function jakartaDayStart(now = Date.now()) {
  const WIB = 7 * 60 * 60 * 1000;
  return new Date(Math.floor((now + WIB) / 86400000) * 86400000 - WIB);
}

module.exports = { INVITE_TTL, PASSWORD_MIN, STATUS, MSG, validateInvite, validateAccept, nameFromEmail, roleChangeError, deactivateError, memberView, jakartaDayStart };
