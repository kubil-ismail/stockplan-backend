'use strict';

module.exports = (sequelize, DataTypes) => {
  return sequelize.define('AdminAuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminId: DataTypes.UUID,
    email: { type: DataTypes.STRING, allowNull: false },
    // login_failed | twofa_failed | account_locked | login_password_ok | login_ok | logout
    action: { type: DataTypes.STRING(40), allowNull: false },
    target: DataTypes.STRING(80),
    ip: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(512),
  }, { tableName: 'admin_audit_logs', updatedAt: false });
};
