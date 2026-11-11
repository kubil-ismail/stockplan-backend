'use strict';

const { Op, fn, col, literal } = require('sequelize');
const { sequelize, User, Session, WatchlistItem } = require('../models');
const au = require('../lib/adminUsers');
const auth = require('../lib/auth');
const companies = require('../lib/companies');
const mailer = require('../lib/mailer');
const { audit } = require('../lib/audit');
const { fail } = require('../lib/http');

const PAGE_MAX = 100;
const DAY = 24 * 60 * 60 * 1000;
const RESET_TTL = 60 * 60 * 1000; // "Berlaku 1 jam."
const CONFIRM_TTL = 24 * 60 * 60 * 1000;
const TABS = ['all', ...Object.keys(au.STATUSES)];

const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s);
const loadUser = (id) => (isUuid(id) ? User.findByPk(id) : null);
const notFound = (res) => fail(res, 404, 'NOT_FOUND', au.MSG.notFound);

// Search + plan filter. Tab counts use this; the tab itself adds a status condition on top.
function baseWhere(req) {
  const q = String(req.query.q || '').trim().slice(0, 50);
  const plan = au.PLANS[req.query.plan];
  const and = [];
  if (q) {
    const like = `%${companies.escapeLike(q)}%`;
    and.push({ [Op.or]: [{ name: { [Op.iLike]: like } }, { email: { [Op.iLike]: like } }] });
  }
  if (plan) and.push({ plan: plan.plan });
  return and;
}
const statusIs = (s) => literal(`(${au.STATUS_SQL}) = '${s}'`); // s is whitelisted via TABS

// Stat cards on top of the page.
async function summary() {
  const now = Date.now();
  const [total, newThisWeek, active7, interested, yearly] = await Promise.all([
    User.count(),
    User.count({ where: { createdAt: { [Op.gte]: new Date(now - 7 * DAY) } } }),
    User.count({ where: { lastActiveAt: { [Op.gte]: new Date(now - 7 * DAY) } } }),
    User.count({ where: { plan: { [Op.ne]: 'beta' } } }),
    User.count({ where: { plan: 'yearly' } }),
  ]);
  return {
    total, newThisWeek,
    active7Days: { count: active7, percent: total ? Math.round((active7 / total) * 100) : 0 },
    thesisWriters: { count: 0, avgPerWriter: null }, // shortcut: Tesis module not built
    subscriptionInterest: { count: interested, yearlyPercent: interested ? Math.round((yearly / interested) * 100) : 0 },
  };
}

// GET /admin/api/users?q=&tab=all|act|new|idle|sus&plan=y|m|n&page=&pageSize=  — AdminPengguna
exports.index = async (req, res, next) => {
  const tab = TABS.includes(req.query.tab) ? req.query.tab : 'all';
  const pageSize = Math.min(PAGE_MAX, Math.max(1, parseInt(req.query.pageSize, 10) || 12));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const and = baseWhere(req);
    const where = { [Op.and]: tab === 'all' ? and : [...and, statusIs(tab)] };
    const [counts, { rows, count }, stats] = await Promise.all([
      User.findAll({ attributes: [[literal(au.STATUS_SQL), 'status'], [fn('COUNT', col('id')), 'n']], where: { [Op.and]: and }, group: ['status'], raw: true }),
      User.findAndCountAll({ where, order: [['createdAt', 'DESC'], ['id', 'ASC']], limit: pageSize, offset: (page - 1) * pageSize }),
      summary(),
    ]);
    const tabs = { all: 0, act: 0, new: 0, idle: 0, sus: 0 };
    for (const c of counts) { tabs[c.status] = Number(c.n); tabs.all += Number(c.n); }
    res.json({ summary: stats, tabs, total: count, page, pageSize, items: rows.map((u) => au.listRow(u)) });
  } catch (err) {
    next(err);
  }
};

// GET /admin/api/users/export.csv — "Ekspor CSV". Never includes thesis/portfolio content (design).
exports.exportCsv = async (req, res, next) => {
  try {
    const rows = await User.findAll({ where: { [Op.and]: baseWhere(req) }, order: [['createdAt', 'DESC']] });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="pengguna.csv"' });
    res.send(au.toCsv(rows.map((u) => au.listRow(u))));
  } catch (err) {
    next(err);
  }
};

async function detail(user) {
  const [sessions, watchlistCount] = await Promise.all([
    Session.findAll({ where: { userId: user.id }, order: [['updatedAt', 'DESC']], limit: 3, attributes: ['userAgent', 'updatedAt'] }),
    WatchlistItem.count({ where: { userId: user.id } }),
  ]);
  return { user: au.detailView(user, { sessions, watchlistCount }) };
}

// GET /admin/api/users/:id — side panel
exports.show = async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return notFound(res);
    res.json(await detail(user));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/users/:id/suspend { reason, note? } — signs the user out of every device.
exports.suspend = async (req, res, next) => {
  const { values, errors } = au.validateSuspend(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', errors.reason || errors.note, errors);
  try {
    const user = await loadUser(req.params.id);
    if (!user) return notFound(res);
    if (user.suspendedAt) return fail(res, 409, 'ALREADY_SUSPENDED', au.MSG.alreadySuspended);
    await sequelize.transaction(async (transaction) => {
      await user.update({ suspendedAt: new Date(), suspendReason: values.reason, suspendNote: values.note || null, suspendedBy: req.admin.name }, { transaction });
      await Session.destroy({ where: { userId: user.id }, transaction });
    });
    await audit(req, 'user_suspended', user.id, {
      summary: { verb: 'menangguhkan akun', target: user.name, rest: `(${user.email}) · alasan: ${values.reason}` }, // email in the sentence so Riwayat search finds it
      changes: [{ field: 'status', label: 'Status akun', before: 'Aktif', after: 'Ditangguhkan' }],
      revert: { type: 'user_suspension', ref: user.id, before: null, after: { reason: values.reason } },
    });
    res.json(await detail(user));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/users/:id/restore — "Pulihkan akun"
exports.restore = async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return notFound(res);
    if (!user.suspendedAt) return fail(res, 409, 'NOT_SUSPENDED', au.MSG.notSuspended);
    await user.update({ suspendedAt: null, suspendReason: null, suspendNote: null, suspendedBy: null });
    await audit(req, 'user_restored', user.id, {
      summary: { verb: 'memulihkan akun', target: user.name, rest: `(${user.email})` },
      changes: [{ field: 'status', label: 'Status akun', before: 'Ditangguhkan', after: 'Aktif' }],
    });
    res.json(await detail(user));
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/users/:id/resend-confirmation
// Reuses the email-change token with pendingEmail = current email, so POST /auth/confirm-email-change confirms it.
exports.resendConfirmation = async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return notFound(res);
    if (user.emailVerified) return fail(res, 409, 'ALREADY_VERIFIED', au.MSG.alreadyVerified);
    const token = auth.newSessionToken();
    await user.update({ pendingEmail: user.email, pendingEmailTokenHash: auth.hashToken(token), pendingEmailExpiresAt: new Date(Date.now() + CONFIRM_TTL) });
    await mailer.sendEmailChange(user.email, token);
    await audit(req, 'user_confirmation_resent', user.id, { summary: { verb: 'mengirim ulang email konfirmasi ke', target: user.email, rest: '' } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/users/:id/password-reset — emails a 1-hour link; the user sets the password via POST /auth/reset-password.
exports.passwordReset = async (req, res, next) => {
  try {
    const user = await loadUser(req.params.id);
    if (!user) return notFound(res);
    if (!user.emailVerified || user.suspendedAt) return fail(res, 409, 'CANNOT_RESET', au.MSG.cannotReset);
    const token = auth.newSessionToken();
    await user.update({ passwordResetTokenHash: auth.hashToken(token), passwordResetExpiresAt: new Date(Date.now() + RESET_TTL) });
    await mailer.sendPasswordReset(user.email, token);
    await audit(req, 'user_password_reset_sent', user.id, { summary: { verb: 'mengirim tautan atur ulang password ke', target: user.email, rest: '' } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/users/invite { email } — "Undang pengguna beta".
// shortcut: sign-up is open and invites aren't tracked, so this only emails the sign-up link, upgrade: invite table + gated sign-up.
exports.invite = async (req, res, next) => {
  const { values, errors } = au.validateInvite(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', errors.email, errors);
  try {
    if (await User.findOne({ where: { email: values.email }, attributes: ['id'] })) {
      return fail(res, 409, 'EMAIL_TAKEN', auth.MSG.emailTaken, { email: auth.MSG.emailTaken });
    }
    await mailer.sendBetaInvite(values.email);
    await audit(req, 'user_invited', values.email, { summary: { verb: 'mengundang pengguna beta', target: values.email, rest: '' } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
