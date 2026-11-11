'use strict';

const { Op } = require('sequelize');
const { AdminUser, AdminSession, AdminTrustedDevice, AdminAuditLog } = require('../models');
const { record } = require('../lib/audit');
const auth = require('../lib/auth');
const a = require('../lib/adminAuth');
const totp = require('../lib/totp');
const access = require('../lib/adminAccess');
const { fail } = require('../lib/http');

const SESSION_COOKIE = 'asid';
const TRUST_COOKIE = 'atd';
const cookieOpts = (maxAge) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/admin/api',
  ...(maxAge && { maxAge }),
});

const dummyHash = auth.hashPassword('dummy-password-for-timing');

const meta = (req) => ({ ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 512) });
const audit = (req, email, action, adminId = null) => record({ adminId, email, action, ip: req.ip, userAgent: req.get('user-agent') });

async function lockFor(email) {
  const lastOk = await AdminAuditLog.findOne({ where: { email, action: 'login_ok' }, order: [['createdAt', 'DESC']] });
  const since = new Date(Math.max(Date.now() - a.LOCK_MS, lastOk ? lastOk.createdAt.getTime() : 0));
  const rows = await AdminAuditLog.findAll({
    where: { email, action: { [Op.in]: ['login_failed', 'twofa_failed'] }, createdAt: { [Op.gt]: since } },
    attributes: ['createdAt'],
  });
  return a.lockState(rows.map((r) => r.createdAt.getTime()));
}

// Records a failed attempt; the 5th one locks the account.
async function failAttempt(req, res, email, adminId, action, code, message) {
  await audit(req, email, action, adminId);
  const state = await lockFor(email);
  if (state.locked) {
    await audit(req, email, 'account_locked', adminId);
    // shortcut: "super admin diberi tahu" hanya tercatat di audit log + console, upgrade: kirim notifikasi saat modul notifikasi admin ada.
    console.warn(`[admin] akun ${email} dikunci sampai ${state.until.toISOString()}`);
    return fail(res, 429, 'ACCOUNT_LOCKED', a.MSG.locked);
  }
  return fail(res, 401, code, typeof message === 'function' ? message(state.left) : message);
}

async function startSession(req, res, adminId, verified) {
  const token = auth.newSessionToken();
  const ttl = verified ? a.IDLE_TTL : a.PENDING_TTL;
  await AdminSession.create({ adminId, tokenHash: auth.hashToken(token), verified, ...meta(req), expiresAt: new Date(Date.now() + ttl) });
  res.cookie(SESSION_COOKIE, token, cookieOpts()); // session cookie: gone when browser closes
}

// Step 1: email + password. Returns { step: 'two_factor' } or, from a trusted device, { admin }.
exports.login = async (req, res, next) => {
  const { values, errors } = a.validateLogin(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review

  try {
    if ((await lockFor(values.email)).locked) return fail(res, 429, 'ACCOUNT_LOCKED', a.MSG.locked);

    const admin = await AdminUser.findOne({ where: { email: values.email } });
    const ok = await auth.verifyPassword(values.password, admin ? admin.passwordHash : await dummyHash);
    if (!admin || !ok || admin.status !== 'active') {
      return failAttempt(req, res, values.email, admin && admin.id, 'login_failed', 'BAD_CREDENTIALS', a.MSG.badCredentials);
    }
    await audit(req, admin.email, 'login_password_ok', admin.id);

    const trustToken = req.cookies && req.cookies[TRUST_COOKIE];
    const trusted = trustToken && (await AdminTrustedDevice.findOne({
      where: { adminId: admin.id, tokenHash: auth.hashToken(trustToken), expiresAt: { [Op.gt]: new Date() } },
    }));
    if (trusted) {
      await startSession(req, res, admin.id, true);
      await audit(req, admin.email, 'login_ok', admin.id);
      return res.json({ admin });
    }
    await startSession(req, res, admin.id, false);
    res.json({ step: 'two_factor', email: admin.email });
  } catch (err) {
    next(err);
  }
};

// Step 2 (needs requireAdmin.pending): TOTP or backup code.
exports.verify = async (req, res, next) => {
  const { values, errors } = a.validateVerify(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', errors.code, errors);

  try {
    const admin = req.admin;
    if ((await lockFor(admin.email)).locked) return fail(res, 429, 'ACCOUNT_LOCKED', a.MSG.locked);

    let ok;
    if (values.method === 'totp') {
      ok = totp.verify(admin.totpSecret, values.code);
    } else {
      const hash = a.hashCode(values.code);
      ok = admin.backupCodes.includes(hash);
      if (ok) await admin.update({ backupCodes: admin.backupCodes.filter((h) => h !== hash) }); // single use
    }
    if (!ok) {
      return failAttempt(req, res, admin.email, admin.id, 'twofa_failed', 'BAD_CODE', values.method === 'totp' ? a.MSG.otpWrong : a.MSG.backupWrong);
    }

    await req.adminSession.destroy(); // new token after 2FA, the step-1 token is dropped
    await startSession(req, res, admin.id, true);
    await audit(req, admin.email, 'login_ok', admin.id);
    if (!admin.twoFactorEnabledAt) await admin.update({ twoFactorEnabledAt: new Date() }); // "2FA ✓ Aktif" in Akses

    if (values.trustDevice) {
      const token = auth.newSessionToken();
      await AdminTrustedDevice.create({ adminId: admin.id, tokenHash: auth.hashToken(token), ...meta(req), expiresAt: new Date(Date.now() + a.TRUST_TTL) });
      res.cookie(TRUST_COOKIE, token, cookieOpts(a.TRUST_TTL));
    }
    res.json({ admin });
  } catch (err) {
    next(err);
  }
};

// Works for pending and verified sessions ("Ganti akun" on step 2 too). Idempotent.
exports.logout = async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    const session = token && (await AdminSession.findOne({ where: { tokenHash: auth.hashToken(token) }, include: AdminUser }));
    if (session) {
      if (session.verified && session.AdminUser) await audit(req, session.AdminUser.email, 'logout', session.adminId);
      await session.destroy();
    }
    res.clearCookie(SESSION_COOKIE, { path: '/admin/api' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// perms: what the UI may show/enable (server still checks every endpoint).
exports.me = (req, res) => res.json({ admin: req.admin, perms: req.adminPerms });

// Public: the emailed invite token is the credential. Sets the password and issues 2FA; the member then signs in
// normally (password + first TOTP code). shortcut: activation screens are not designed (handoff design §12).
exports.acceptInvite = async (req, res, next) => {
  const { values, errors } = access.validateAccept(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  try {
    const admin = values.token && (await AdminUser.findOne({
      where: { inviteTokenHash: auth.hashToken(values.token), inviteExpiresAt: { [Op.gt]: new Date() }, status: 'invited' },
    }));
    if (!admin) return fail(res, 400, 'BAD_TOKEN', access.MSG.badInvite);
    const secret = totp.newSecret();
    const backupCodes = a.newBackupCodes();
    await admin.update({
      ...(values.name && { name: values.name }),
      passwordHash: await auth.hashPassword(values.password),
      totpSecret: secret, backupCodes: backupCodes.map(a.hashCode), twoFactorEnabledAt: null,
      status: 'active', inviteTokenHash: null, inviteExpiresAt: null,
    });
    await audit(req, admin.email, 'invite_accepted', admin.id);
    // Shown once: the client renders the QR from otpauthUri and asks the member to store the backup codes.
    res.json({ email: admin.email, totp: { secret, otpauthUri: totp.otpauthUri(secret, admin.email) }, backupCodes });
  } catch (err) {
    next(err);
  }
};
