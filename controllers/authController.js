'use strict';

const { Op, UniqueConstraintError } = require('sequelize');
const { User, Session } = require('../models');
const auth = require('../lib/auth');

const COOKIE = 'sid';
const HOUR = 60 * 60 * 1000;
// "Ingat saya" keeps the session 30 days; otherwise 24 hours (HANDOFF §7 "Sesi berakhir").
const TTL = { remember: 30 * 24 * HOUR, short: 24 * HOUR };

// Hash used when the email doesn't exist, so login time doesn't reveal registered emails.
const dummyHash = auth.hashPassword('dummy-password-for-timing');

const { fail } = require('../lib/http');

exports.register = async (req, res, next) => {
  const { values, errors } = auth.validateRegister(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review

  try {
    const user = await User.create({
      name: values.name,
      email: values.email,
      passwordHash: await auth.hashPassword(values.password),
    });
    // shortcut: confirmation email not sent yet, user stays emailVerified=false until /auth/confirm exists.
    res.status(201).json({ user, message: 'Akun dibuat — cek email Anda untuk konfirmasi.' });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      return fail(res, 409, 'EMAIL_TAKEN', auth.MSG.emailTaken, { email: auth.MSG.emailTaken });
    }
    next(err);
  }
};

exports.login = async (req, res, next) => {
  const { values, errors } = auth.validateLogin(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review

  try {
    const user = await User.findOne({ where: { email: values.email } });
    const ok = await auth.verifyPassword(values.password, user ? user.passwordHash : await dummyHash);
    if (!user || !ok) return fail(res, 401, 'BAD_CREDENTIALS', auth.MSG.badCredentials);
    if (user.suspendedAt) return fail(res, 403, 'ACCOUNT_SUSPENDED', auth.MSG.suspended);
    if (!user.emailVerified) return fail(res, 403, 'EMAIL_UNCONFIRMED', auth.MSG.unconfirmed);

    await user.update({ lastActiveAt: new Date() });
    const token = auth.newSessionToken();
    const ttl = values.remember ? TTL.remember : TTL.short;
    await Session.create({
      userId: user.id,
      tokenHash: auth.hashToken(token),
      userAgent: (req.get('user-agent') || '').slice(0, 512),
      ip: req.ip,
      expiresAt: new Date(Date.now() + ttl),
    });

    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      ...(values.remember && { maxAge: ttl }), // without "Ingat saya": browser-session cookie
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

// Needs requireAuth (req.session). Ends only the current device's session.
exports.logout = async (req, res, next) => {
  try {
    await req.session.destroy();
    res.clearCookie(COOKIE, { path: '/' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// Public: the token from the emailed link is the credential.
exports.confirmEmailChange = async (req, res, next) => {
  const token = req.body && typeof req.body.token === 'string' ? req.body.token : '';
  try {
    const user = token && (await User.findOne({
      where: { pendingEmailTokenHash: auth.hashToken(token), pendingEmailExpiresAt: { [Op.gt]: new Date() } },
    }));
    if (!user) return fail(res, 400, 'BAD_TOKEN', auth.MSG.badToken);
    await user.update({
      email: user.pendingEmail, emailVerified: true,
      pendingEmail: null, pendingEmailTokenHash: null, pendingEmailExpiresAt: null,
    });
    res.json({ user });
  } catch (err) {
    if (err instanceof UniqueConstraintError) return fail(res, 409, 'EMAIL_TAKEN', auth.MSG.emailTaken);
    next(err);
  }
};

// Public: the emailed token (from admin "Kirim tautan atur ulang password") is the credential. Signs out every device.
exports.resetPassword = async (req, res, next) => {
  const { values, errors } = auth.validateReset(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    const user = values.token && (await User.findOne({
      where: { passwordResetTokenHash: auth.hashToken(values.token), passwordResetExpiresAt: { [Op.gt]: new Date() }, suspendedAt: null },
    }));
    if (!user) return fail(res, 400, 'BAD_TOKEN', auth.MSG.badResetToken);
    await user.update({
      passwordHash: await auth.hashPassword(values.password), passwordChangedAt: new Date(),
      passwordResetTokenHash: null, passwordResetExpiresAt: null,
    });
    await Session.destroy({ where: { userId: user.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
