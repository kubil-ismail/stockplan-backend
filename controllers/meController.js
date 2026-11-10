'use strict';

const { Op } = require('sequelize');
const { Session, User } = require('../models');
const auth = require('../lib/auth');
const profile = require('../lib/profile');
const prefs = require('../lib/prefs');
const mailer = require('../lib/mailer');

const { fail } = require('../lib/http');

exports.show = (req, res) => res.json({ user: req.user });

exports.update = async (req, res, next) => {
  const { values, errors } = profile.validateProfile(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    await req.user.update(values);
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
};

exports.changePassword = async (req, res, next) => {
  const { values, errors } = profile.validatePasswordChange(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    if (!(await auth.verifyPassword(values.current, req.user.passwordHash))) {
      return fail(res, 422, 'VALIDATION', profile.MSG.currentWrong, { currentPassword: profile.MSG.currentWrong });
    }
    await req.user.update({ passwordHash: await auth.hashPassword(values.next), passwordChangedAt: new Date() });
    // Sign out every other device, keep this one.
    await Session.destroy({ where: { userId: req.user.id, id: { [Op.ne]: req.session.id } } });
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
};

exports.sessions = async (req, res, next) => {
  try {
    const rows = await Session.findAll({
      where: { userId: req.user.id, expiresAt: { [Op.gt]: new Date() } },
      order: [['updatedAt', 'DESC']],
    });
    res.json({
      sessions: rows.map((s) => ({
        id: s.id,
        device: profile.deviceLabel(s.userAgent),
        ip: s.ip,
        lastActiveAt: s.updatedAt,
        current: s.id === req.session.id,
      })),
    });
  } catch (err) {
    next(err);
  }
};

exports.revokeSession = async (req, res, next) => {
  try {
    if (req.params.id === req.session.id) {
      return fail(res, 400, 'CURRENT_SESSION', 'Gunakan Keluar untuk mengakhiri sesi perangkat ini.'); // COPY: perlu review
    }
    // Scoped to the owner so one user can never revoke another's session.
    const n = await Session.destroy({ where: { id: req.params.id, userId: req.user.id } });
    if (!n) return fail(res, 404, 'NOT_FOUND', 'Sesi tidak ditemukan.'); // COPY: perlu review
    res.status(204).end();
  } catch (err) {
    // Non-UUID id makes Postgres throw; treat it as not found.
    if (err.name === 'SequelizeDatabaseError') return fail(res, 404, 'NOT_FOUND', 'Sesi tidak ditemukan.');
    next(err);
  }
};

exports.updatePrefs = async (req, res, next) => {
  const { values, errors } = prefs.validatePrefs(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', 'Periksa lagi isian Anda.', errors); // COPY: perlu review
  try {
    await req.user.update({ prefs: prefs.mergePrefs(req.user.prefs, values) });
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
};

const EMAIL_TTL = 24 * 60 * 60 * 1000;

// Old email stays active until the link is clicked (design: "Email lama tetap dipakai sampai link itu diklik").
exports.requestEmailChange = async (req, res, next) => {
  const email = auth.normEmail(req.body && req.body.email);
  const bad = auth.checkEmail(email) || (email === req.user.email ? auth.MSG.sameEmail : null);
  if (bad) return fail(res, 422, 'VALIDATION', bad, { email: bad });
  try {
    if (await User.findOne({ where: { email } })) {
      return fail(res, 409, 'EMAIL_TAKEN', auth.MSG.emailTaken, { email: auth.MSG.emailTaken });
    }
    const token = auth.newSessionToken();
    await req.user.update({
      pendingEmail: email,
      pendingEmailTokenHash: auth.hashToken(token),
      pendingEmailExpiresAt: new Date(Date.now() + EMAIL_TTL),
    });
    await mailer.sendEmailChange(email, token);
    res.json({ user: req.user, message: `Link konfirmasi dikirim ke ${email}` });
  } catch (err) {
    next(err);
  }
};

exports.destroy = async (req, res, next) => {
  if (!req.body || req.body.confirm !== 'HAPUS') {
    return fail(res, 422, 'VALIDATION', auth.MSG.confirmDelete, { confirm: auth.MSG.confirmDelete });
  }
  try {
    // Sessions go with it (ON DELETE CASCADE). Add cascades for theses/portfolio/watchlist when those tables exist.
    await req.user.destroy();
    res.clearCookie('sid', { path: '/' });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
