'use strict';

const { AdminAuditLog } = require('../models');
const { classify } = require('./adminHistory');

// The only writer of admin_audit_logs. Rows are append-only (the one later update is revertedAt/revertedById).
// extra: { summary: { verb, target, rest }, changes: [...], revert: { type, ref, before, after } }
exports.record = ({ adminId = null, email, action, target = null, ip = null, userAgent = null, ...extra }) =>
  AdminAuditLog.create({
    adminId, email, action, target: target && String(target).slice(0, 80),
    ip, userAgent: userAgent && String(userAgent).slice(0, 512),
    ...classify(action),
    ...(extra.module !== undefined && { module: extra.module }), ...(extra.kind !== undefined && { kind: extra.kind }), // revert rows inherit these
    summary: extra.summary || null, changes: extra.changes && extra.changes.length ? extra.changes : null, revert: extra.revert || null,
  });

// For admin actions: `req` must have passed requireAdmin.
exports.audit = (req, action, target = null, extra = {}) =>
  exports.record({ adminId: req.admin.id, email: req.admin.email, action, target, ip: req.ip, userAgent: req.get('user-agent'), ...extra });
