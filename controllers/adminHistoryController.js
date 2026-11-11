'use strict';

const { isDeepStrictEqual } = require('util');
const { Op, Sequelize, fn, col } = require('sequelize');
const { sequelize, AdminAuditLog, AdminUser, AdminRole, Company, Sector, Industry, Theme, ThemeStage, User } = require('../models');
const hist = require('../lib/adminHistory');
const co = require('../lib/adminCompanies');
const th = require('../lib/adminThemes');
const ac = require('../lib/adminAccess');
const ro = require('../lib/adminRoles');
const { can } = require('../lib/adminRoles');
const { escapeLike } = require('../lib/companies');
const { audit } = require('../lib/audit');
const { fail } = require('../lib/http');

const PAGE_MAX = 200;
const CSV_MAX = 5000;
const TABS = ['all', ...hist.KINDS];
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));
const MSG = {
  notFound: 'Entri tidak ditemukan.', // COPY: perlu review
  notRevertable: 'Perubahan ini tidak bisa dikembalikan.', // COPY: perlu review
  already: 'Perubahan ini sudah dikembalikan.', // COPY: perlu review
  conflict: 'Datanya sudah berubah lagi setelah perubahan ini, jadi tidak bisa dikembalikan otomatis.', // COPY: perlu review
  gone: 'Datanya sudah tidak ada.', // COPY: perlu review
  done: 'Dikembalikan ke nilai sebelumnya. Tercatat sebagai perubahan baru.',
};

// ---- listing ----
const include = [{ model: AdminUser, attributes: ['id', 'name'], required: false }];
const cast = (column) => Sequelize.cast(Sequelize.col(`AdminAuditLog.${column}`), 'text');

// Filters shared by the list, the tab counts and the CSV. The tab (kind) is added separately.
function baseWhere(req) {
  const q = String(req.query.q || '').trim().slice(0, 60);
  const mod = hist.MODULES.find((m) => m.key === req.query.module);
  const who = String(req.query.who || '');
  const and = [
    { createdAt: { [Op.gte]: new Date(Date.now() - hist.rangeDays(req.query.range) * 86400000) } },
    { action: { [Op.notIn]: hist.HIDDEN_ACTIONS } },
  ];
  if (mod) and.push({ module: mod.key });
  if (who === hist.SYSTEM) and.push({ action: { [Op.in]: hist.SYSTEM_ACTIONS } });
  else if (isUuid(who)) and.push({ adminId: who }, { action: { [Op.notIn]: hist.SYSTEM_ACTIONS } });
  if (q) {
    const like = `%${escapeLike(q)}%`;
    and.push({
      [Op.or]: [
        { target: { [Op.iLike]: like } }, { email: { [Op.iLike]: like } }, { action: { [Op.iLike]: like } },
        Sequelize.where(cast('summary'), { [Op.iLike]: like }), Sequelize.where(cast('changes'), { [Op.iLike]: like }),
        { '$AdminUser.name$': { [Op.iLike]: like } },
      ],
    });
  }
  return and;
}

const canRevertFn = (perms) => (type) => {
  const need = hist.REVERT_PERMS[type];
  return !!need && can(perms, 'log', 'edit') && can(perms, need[0], need[1]);
};
const views = (rows, perms) => rows.map((r) => hist.entryView(r.get ? r.get({ plain: true }) : r, {
  actorName: r.AdminUser ? r.AdminUser.name : null, canRevertFn: canRevertFn(perms),
}));

// GET /admin/api/history?q=&module=&who=&range=&tab=&page=&pageSize=  — AdminRiwayat
exports.index = async (req, res, next) => {
  const tab = TABS.includes(req.query.tab) ? req.query.tab : 'all';
  const pageSize = Math.min(PAGE_MAX, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  try {
    const and = baseWhere(req);
    const where = { [Op.and]: tab === 'all' ? and : [...and, { kind: tab }] };
    const [counts, rows, admins] = await Promise.all([
      AdminAuditLog.findAll({ attributes: ['kind', [fn('COUNT', col('AdminAuditLog.id')), 'n']], where: { [Op.and]: and }, include: [{ ...include[0], attributes: [] }], group: ['AdminAuditLog.kind'], raw: true }),
      AdminAuditLog.findAll({ where, include, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: pageSize, offset: (page - 1) * pageSize, subQuery: false }),
      AdminUser.findAll({ attributes: ['id', 'name'], order: [['name', 'ASC']] }),
    ]);
    const tabs = { all: 0, data: 0, pub: 0, sec: 0 };
    for (const c of counts) { tabs[c.kind] = Number(c.n); tabs.all += Number(c.n); }
    res.json({
      tabs, total: tabs[tab], page, pageSize,
      days: hist.groupByDay(views(rows, req.adminPerms)),
      modules: hist.MODULES,
      actors: [...admins.map((a) => ({ id: a.id, name: a.name })), { id: hist.SYSTEM, name: 'Sistem' }],
      retentionDays: hist.RANGE_MAX,
    });
  } catch (err) {
    next(err);
  }
};

// GET /admin/api/history/export.csv — same filters; capped at 5000 rows.
exports.exportCsv = async (req, res, next) => {
  try {
    const tab = TABS.includes(req.query.tab) ? req.query.tab : 'all';
    const and = baseWhere(req);
    const rows = await AdminAuditLog.findAll({ where: { [Op.and]: tab === 'all' ? and : [...and, { kind: tab }] }, include, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: CSV_MAX, subQuery: false });
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="riwayat.csv"' });
    res.send(hist.toCsv(views(rows, req.adminPerms)));
  } catch (err) {
    next(err);
  }
};

// ---- revert ----
const httpErr = (status, code, message) => Object.assign(new Error(message), { http: { status, code } });
const conflict = () => httpErr(409, 'CONFLICT', MSG.conflict);
const gone = () => httpErr(404, 'NOT_FOUND', MSG.gone);
const guard = (msg) => httpErr(...ac.guardStatus(msg), msg);
const nullish = (v) => (v === undefined ? null : v);
// Every section the original change wrote must still hold the value it wrote.
const unchanged = (current, after) => Object.keys(after).every((k) => isDeepStrictEqual(nullish(current[k]), after[k]));
const activeSupers = () => AdminUser.count({ where: { role: ro.SUPER, status: 'active' } });

// Each reverter applies `rev.before` and returns { target } for the new log row. It throws httpErr on conflicts.
const REVERTERS = {
  async company_sections(req, rev) {
    const row = await Company.findByPk(rev.ref, { include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: Industry, as: 'industry', attributes: ['name'] }] });
    if (!row) throw gone();
    const current = row.draft || co.columnsToForm(row);
    if (!unchanged(current, rev.after)) throw conflict();
    const form = { ...current, ...rev.before };
    if (row.status !== 'ipo') form.ipo = null;
    await row.update({ draft: form, publishStatus: 'draft', updatedByName: req.admin.name });
    return { target: row.ticker };
  },

  async theme_sections(req, rev) {
    const theme = await Theme.findOne({ where: { slug: rev.ref }, include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: ThemeStage, as: 'stages' }] });
    if (!theme) throw gone();
    const current = theme.draft || th.columnsToForm(theme, theme.stages);
    if (!unchanged(current, rev.after)) throw conflict();
    await theme.update({ draft: { ...current, ...rev.before }, status: can(req.adminPerms, 'tm', 'publish') ? 'draft' : 'review', updatedByName: req.admin.name });
    return { target: current.name };
  },

  async member_role(req, rev) {
    const m = await AdminUser.findByPk(rev.ref);
    if (!m) throw gone();
    if (m.role !== rev.after) throw conflict();
    if (!(await AdminRole.findByPk(rev.before, { attributes: ['id'] }))) throw gone();
    const err = ac.roleChangeError(req.admin, m, rev.before, await activeSupers());
    if (err) throw guard(err);
    await m.update({ role: rev.before });
    return { target: m.email };
  },

  async user_suspension(req, rev) {
    const user = await User.findByPk(rev.ref);
    if (!user) throw gone();
    if (!user.suspendedAt) throw conflict();
    await user.update({ suspendedAt: null, suspendReason: null, suspendNote: null, suspendedBy: null });
    return { target: user.name };
  },

  async member_status(req, rev) {
    const m = await AdminUser.findByPk(rev.ref);
    if (!m) throw gone();
    if (m.status !== 'disabled') throw conflict();
    if (m.role === ro.SUPER && req.admin.role !== ro.SUPER) throw guard(ac.MSG.superOnly);
    await m.update({ status: m.passwordHash ? 'active' : 'invited', disabledAt: null });
    return { target: m.email };
  },

  async role_perms(req, rev) {
    const role = await AdminRole.findByPk(rev.ref);
    if (!role) throw gone();
    if (role.id === ro.SUPER) throw httpErr(403, 'SUPER_LOCKED', ro.MSG.superLocked);
    if (role.id === req.admin.role) throw httpErr(403, 'OWN_ROLE', ro.MSG.ownRole);
    if (!unchanged({ name: role.name, description: role.description || '', perms: role.perms }, rev.after)) throw conflict();
    try {
      await role.update(rev.before);
    } catch (err) {
      if (err.name === 'SequelizeUniqueConstraintError') throw conflict(); // the old name was taken meanwhile
      throw err;
    }
    return { target: role.name };
  },
};

// POST /admin/api/history/:id/revert — "Kembalikan". Applies the old value as a NEW change (itself logged);
// the original row stays, marked as reverted. Needs log:edit plus the permission of the module being changed.
exports.revert = async (req, res, next) => {
  try {
    const orig = isUuid(req.params.id) && (await AdminAuditLog.findByPk(req.params.id, { include }));
    if (!orig) return fail(res, 404, 'NOT_FOUND', MSG.notFound);
    if (!orig.revert) return fail(res, 409, 'NOT_REVERTABLE', MSG.notRevertable);
    if (orig.revertedAt) return fail(res, 409, 'ALREADY_REVERTED', MSG.already);
    if (!canRevertFn(req.adminPerms)(orig.revert.type)) return fail(res, 403, 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'); // COPY: perlu review

    // Claim first so two clicks can't both revert; released again if the revert itself fails.
    const [claimed] = await AdminAuditLog.update({ revertedAt: new Date() }, { where: { id: orig.id, revertedAt: null }, silent: true });
    if (!claimed) return fail(res, 409, 'ALREADY_REVERTED', MSG.already);
    let result;
    try {
      result = await REVERTERS[orig.revert.type](req, orig.revert);
    } catch (err) {
      await AdminAuditLog.update({ revertedAt: null }, { where: { id: orig.id }, silent: true });
      if (err.http) return fail(res, err.http.status, err.http.code, err.message);
      throw err;
    }

    const origView = hist.entryView(orig.get({ plain: true }), { actorName: orig.AdminUser ? orig.AdminUser.name : null });
    const entry = await audit(req, 'revert', `log:${orig.id}`, {
      module: orig.module, kind: orig.kind,
      summary: { verb: 'mengembalikan perubahan', target: result.target || origView.target, rest: `· ${origView.verb} oleh ${origView.actor.name}` },
      changes: (orig.changes || []).map((c) => ({ ...c, before: c.after, after: c.before })),
    });
    await AdminAuditLog.update({ revertedById: entry.id }, { where: { id: orig.id }, silent: true });
    res.json({ message: MSG.done, entry: views([entry], req.adminPerms)[0] });
  } catch (err) {
    next(err);
  }
};
