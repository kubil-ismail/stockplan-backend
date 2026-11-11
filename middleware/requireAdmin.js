'use strict';

const { Op } = require('sequelize');
const { AdminSession, AdminUser, AdminRole } = require('../models');
const { permsOf } = require('../lib/adminRoles');
const { hashToken } = require('../lib/auth');
const { IDLE_TTL, MSG } = require('../lib/adminAuth');
const { fail } = require('../lib/http');

const TOUCH_EVERY = 60 * 1000;

// Loads req.adminSession + req.admin from the `asid` cookie.
// requireAdmin: fully verified (2FA done). requireAdmin.pending: only passed step 1.
const load = (verified) => async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies.asid;
    const session = token && (await AdminSession.findOne({
      where: { tokenHash: hashToken(token), verified, expiresAt: { [Op.gt]: new Date() } },
      include: AdminUser,
    }));
    if (!session || !session.AdminUser || session.AdminUser.status !== 'active') {
      return fail(res, 401, 'UNAUTHENTICATED', verified ? MSG.unauthenticated : MSG.noPending);
    }
    // Idle timeout: each request pushes expiry out again (checked at most once a minute).
    if (verified && Date.now() + IDLE_TTL - session.expiresAt.getTime() > TOUCH_EVERY) {
      await session.update({ expiresAt: new Date(Date.now() + IDLE_TTL) });
    }
    req.adminSession = session;
    req.admin = session.AdminUser;
    // Read on every request so role/permission changes apply immediately.
    req.adminPerms = permsOf(await AdminRole.findByPk(req.admin.role));
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = load(true);
module.exports.pending = load(false);
