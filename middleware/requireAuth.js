'use strict';

const { Op } = require('sequelize');
const { Session, User } = require('../models');
const { hashToken } = require('../lib/auth');

const TOUCH_EVERY = 60 * 1000; // update "aktif terakhir" at most once a minute

// Loads req.session + req.user from the `sid` cookie.
module.exports = async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.sid;
    const session = token && (await Session.findOne({
      where: { tokenHash: hashToken(token), expiresAt: { [Op.gt]: new Date() } },
      include: User,
    }));
    if (!session || !session.User || session.User.suspendedAt) {
      return res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'Sesi tidak valid atau sudah berakhir.' } }); // COPY: perlu review
    }
    if (Date.now() - session.updatedAt.getTime() > TOUCH_EVERY) {
      session.changed('updatedAt', true);
      await session.save();
      await session.User.update({ lastActiveAt: new Date() }, { silent: true });
    }
    req.session = session;
    req.user = session.User;
    next();
  } catch (err) {
    next(err);
  }
};
