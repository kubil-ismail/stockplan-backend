'use strict';

const { Op, fn, col } = require('sequelize');
const { sequelize, AdminUser, AdminRole, AdminSession, AdminTrustedDevice, AdminAuditLog } = require('../models');
const ac = require('../lib/adminAccess');
const ro = require('../lib/adminRoles');
const auth = require('../lib/auth');
const mailer = require('../lib/mailer');
const { audit } = require('../lib/audit');
const { fail } = require('../lib/http');

// Built-in roles in design order, custom roles after them by creation time.
const BUILTIN = ['super', 'data', 'tema', 'support', 'view'];
const rank = (r) => (BUILTIN.includes(r.id) ? BUILTIN.indexOf(r.id) : BUILTIN.length);
const sortRoles = (roles) => [...roles].sort((a, b) => rank(a) - rank(b) || new Date(a.createdAt) - new Date(b.createdAt));

const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(String(s));
const activeSupers = () => AdminUser.count({ where: { role: ro.SUPER, status: 'active' } });
const notFound = (res) => fail(res, 404, 'NOT_FOUND', ac.MSG.notFound);

// Guard message -> HTTP status + code.
const GUARD = {
  [ac.MSG.self]: [400, 'SELF_CHANGE'], [ac.MSG.selfStatus]: [400, 'SELF_CHANGE'],
  [ac.MSG.superOnly]: [403, 'SUPER_ONLY'], [ac.MSG.lastSuper]: [409, 'LAST_SUPER'],
  [ac.MSG.notActive]: [409, 'BAD_STATE'],
};
const guardFail = (res, msg) => fail(res, ...(GUARD[msg] || [409, 'BAD_STATE']), msg);

// shortcut: per-member last login / failures come from scanning admin_audit_logs; fine for a small team,
// upgrade: denormalise lastLoginAt onto admin_users if the log grows large.
async function memberContext(members) {
  const emails = members.map((m) => m.email);
  const [roles, supers, logins, failed] = await Promise.all([
    AdminRole.findAll({ attributes: ['id', 'name'], raw: true }),
    activeSupers(),
    emails.length ? AdminAuditLog.findAll({ where: { email: emails, action: 'login_ok' }, order: [['createdAt', 'DESC']], attributes: ['email', 'createdAt', 'userAgent'], raw: true }) : [],
    emails.length ? AdminAuditLog.findAll({
      where: { email: emails, action: ['login_failed', 'twofa_failed'], createdAt: { [Op.gte]: ac.jakartaDayStart() } },
      attributes: ['email', [fn('COUNT', col('id')), 'n']], group: ['email'], raw: true,
    }) : [],
  ]);
  const last = {};
  for (const l of logins) if (!last[l.email]) last[l.email] = { at: l.createdAt, userAgent: l.userAgent };
  return {
    roleName: Object.fromEntries(roles.map((r) => [r.id, r.name])),
    supers,
    last,
    failed: Object.fromEntries(failed.map((f) => [f.email, Number(f.n)])),
  };
}
const view = (m, ctx, me) => ac.memberView(m, {
  me, roleName: ctx.roleName[m.role], activeSupers: ctx.supers, lastLogin: ctx.last[m.email] || null, failedToday: ctx.failed[m.email] || 0,
});
async function oneMember(m, me) { return view(m, await memberContext([m]), me); }

// GET /admin/api/access/members — tab "Anggota tim"
exports.members = async (req, res, next) => {
  try {
    const [members, roles] = await Promise.all([
      AdminUser.findAll({ order: [['createdAt', 'ASC']] }),
      AdminRole.findAll({ attributes: ['id', 'name', 'createdAt'] }).then(sortRoles),
    ]);
    const ctx = await memberContext(members);
    res.json({
      members: members.map((m) => view(m, ctx, req.admin)),
      counts: { members: members.length, roles: roles.length },
      roleOptions: roles.map((r) => ({ id: r.id, name: r.name })),
    });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/access/members/invite { email, role } — "Undang anggota". Link valid 72 hours.
exports.invite = async (req, res, next) => {
  const { values, errors } = ac.validateInvite(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  try {
    if (!(await AdminRole.findByPk(values.role, { attributes: ['id'] }))) return fail(res, 422, 'VALIDATION', ac.MSG.roleUnknown, { role: ac.MSG.roleUnknown });
    if (values.role === ro.SUPER && req.admin.role !== ro.SUPER) return guardFail(res, ac.MSG.superOnly);
    if (await AdminUser.findOne({ where: { email: values.email }, attributes: ['id'] })) {
      return fail(res, 409, 'EMAIL_TAKEN', ac.MSG.emailTaken, { email: ac.MSG.emailTaken });
    }
    const token = auth.newSessionToken();
    const member = await AdminUser.create({
      name: ac.nameFromEmail(values.email), email: values.email, role: values.role, status: 'invited',
      inviteTokenHash: auth.hashToken(token), inviteExpiresAt: new Date(Date.now() + ac.INVITE_TTL),
      invitedAt: new Date(), invitedBy: req.admin.name,
    });
    await mailer.sendAdminInvite(member.email, token);
    await audit(req, 'member_invited', `admin:${member.id}`);
    res.status(201).json({ member: await oneMember(member, req.admin) });
  } catch (err) {
    next(err);
  }
};

async function loadMember(req, res) {
  const m = isUuid(req.params.id) && (await AdminUser.findByPk(req.params.id));
  if (!m) notFound(res);
  return m || null;
}

// PATCH /admin/api/access/members/:id { role } — applies on the member's next request.
exports.changeRole = async (req, res, next) => {
  const role = req.body && typeof req.body.role === 'string' ? req.body.role : '';
  try {
    const m = await loadMember(req, res);
    if (!m) return undefined;
    if (!(await AdminRole.findByPk(role, { attributes: ['id'] }))) return fail(res, 422, 'VALIDATION', ac.MSG.roleUnknown, { role: ac.MSG.roleUnknown });
    const err = ac.roleChangeError(req.admin, m, role, await activeSupers());
    if (err) return guardFail(res, err);
    if (m.role !== role) {
      await m.update({ role });
      await audit(req, 'member_role_changed', `admin:${m.id}`);
    }
    res.json({ member: await oneMember(m, req.admin) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/access/members/:id/deactivate — "Nonaktifkan": signs out of every session, forgets trusted devices.
exports.deactivate = async (req, res, next) => {
  try {
    const m = await loadMember(req, res);
    if (!m) return undefined;
    const err = ac.deactivateError(req.admin, m, await activeSupers());
    if (err) return guardFail(res, err);
    await sequelize.transaction(async (transaction) => {
      await m.update({ status: 'disabled', disabledAt: new Date() }, { transaction });
      await AdminSession.destroy({ where: { adminId: m.id }, transaction });
      await AdminTrustedDevice.destroy({ where: { adminId: m.id }, transaction });
    });
    await audit(req, 'member_deactivated', `admin:${m.id}`);
    res.json({ member: await oneMember(m, req.admin) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/access/members/:id/reactivate — "Aktifkan lagi". A member who never accepted goes back to "Undangan".
exports.reactivate = async (req, res, next) => {
  try {
    const m = await loadMember(req, res);
    if (!m) return undefined;
    if (m.status !== 'disabled') return fail(res, 409, 'BAD_STATE', ac.MSG.notDisabled);
    if (m.role === ro.SUPER && req.admin.role !== ro.SUPER) return guardFail(res, ac.MSG.superOnly);
    await m.update({ status: m.passwordHash ? 'active' : 'invited', disabledAt: null });
    await audit(req, 'member_reactivated', `admin:${m.id}`);
    res.json({ member: await oneMember(m, req.admin) });
  } catch (err) {
    next(err);
  }
};

// POST /admin/api/access/members/:id/resend-invite — "Kirim ulang": new link, previous one stops working.
exports.resendInvite = async (req, res, next) => {
  try {
    const m = await loadMember(req, res);
    if (!m) return undefined;
    if (m.status !== 'invited') return fail(res, 409, 'BAD_STATE', ac.MSG.notInvited);
    const token = auth.newSessionToken();
    await m.update({ inviteTokenHash: auth.hashToken(token), inviteExpiresAt: new Date(Date.now() + ac.INVITE_TTL), invitedAt: new Date(), invitedBy: req.admin.name });
    await mailer.sendAdminInvite(m.email, token);
    await audit(req, 'member_invite_resent', `admin:${m.id}`);
    res.json({ member: await oneMember(m, req.admin) });
  } catch (err) {
    next(err);
  }
};

// ---- roles ----
async function roleViews(roles) {
  const counts = await AdminUser.findAll({ where: { status: { [Op.ne]: 'disabled' } }, attributes: ['role', [fn('COUNT', col('id')), 'n']], group: ['role'], raw: true });
  const n = Object.fromEntries(counts.map((c) => [c.role, Number(c.n)]));
  return roles.map((r) => {
    const perms = ro.permsOf(r);
    return {
      id: r.id, name: r.name, summary: r.summary || null, description: r.description || null,
      system: r.system, locked: r.id === ro.SUPER, memberCount: n[r.id] || 0,
      perms, sensitive: ro.sensitiveGrants(perms),
    };
  });
}

// GET /admin/api/access/roles — tab "Peran & izin"
exports.roles = async (req, res, next) => {
  try {
    const roles = sortRoles(await AdminRole.findAll());
    res.json({ actions: ro.ACTIONS, modules: ro.MODULES, roles: await roleViews(roles) });
  } catch (err) {
    next(err);
  }
};

const nameTaken = (name, exceptId) => AdminRole.findOne({ where: { name: { [Op.iLike]: name.replace(/[\\%_]/g, '\\$&') }, ...(exceptId && { id: { [Op.ne]: exceptId } }) }, attributes: ['id'] });

// POST /admin/api/access/roles { name, summary?, description?, perms } — "Buat peran baru"
exports.createRole = async (req, res, next) => {
  const { values, errors } = ro.validateRole(req.body, { creating: true });
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  try {
    if (await nameTaken(values.name)) return fail(res, 409, 'ROLE_TAKEN', ro.MSG.nameTaken, { name: ro.MSG.nameTaken });
    const base = ro.roleId(values.name);
    let id = base;
    for (let i = 2; await AdminRole.findByPk(id, { attributes: ['id'] }); i += 1) id = `${base}-${i}`;
    const role = await AdminRole.create({ id, ...values, system: false });
    await audit(req, 'role_created', `role:${id}`);
    res.status(201).json({ role: (await roleViews([role]))[0] });
  } catch (err) {
    next(err);
  }
};

// PUT /admin/api/access/roles/:id { name?, summary?, description?, perms? } — "Simpan izin"
exports.updateRole = async (req, res, next) => {
  const { values, errors } = ro.validateRole(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  try {
    const role = await AdminRole.findByPk(String(req.params.id));
    if (!role) return fail(res, 404, 'NOT_FOUND', 'Peran tidak ditemukan.'); // COPY: perlu review
    if (role.id === ro.SUPER) return fail(res, 403, 'SUPER_LOCKED', ro.MSG.superLocked);
    // Stops a non-super member with acc:edit from widening their own role.
    if (role.id === req.admin.role) return fail(res, 403, 'OWN_ROLE', ro.MSG.ownRole);
    if (values.name && (await nameTaken(values.name, role.id))) return fail(res, 409, 'ROLE_TAKEN', ro.MSG.nameTaken, { name: ro.MSG.nameTaken });
    await role.update(values);
    await audit(req, 'role_updated', `role:${role.id}`);
    res.json({ role: (await roleViews([role]))[0] });
  } catch (err) {
    next(err);
  }
};
