'use strict';

const { AdminAuditLog } = require('../models');

// One row per admin action; the base of Riwayat perubahan. `req` must have passed requireAdmin.
exports.audit = (req, action, target = null) =>
  AdminAuditLog.create({
    adminId: req.admin.id, email: req.admin.email, action, target: target && String(target).slice(0, 80),
    ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 512),
  });
