'use strict';

module.exports = (sequelize, DataTypes) => {
  const AdminAuditLog = sequelize.define('AdminAuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminId: DataTypes.UUID,
    email: { type: DataTypes.STRING, allowNull: false },
    // login_failed | twofa_failed | account_locked | login_password_ok | login_ok | logout
    action: { type: DataTypes.STRING(40), allowNull: false },
    target: DataTypes.STRING(80),
    module: DataTypes.STRING(20), // em | tm | usr | fb | sync | set | acc | security
    kind: DataTypes.STRING(10), // data | pub | sec  (tabs on the page)
    summary: DataTypes.JSONB, // { verb, target, rest } — "Rina memperbarui tren keuangan BUMI (draf)"
    changes: DataTypes.JSONB, // [{ field, label, before, after }]
    revert: DataTypes.JSONB, // { type, ref, before, after }; NULL = cannot be reverted. Never sent to clients.
    revertedAt: DataTypes.DATE,
    revertedById: DataTypes.UUID, // the log row that reverted this one
    ip: DataTypes.STRING(64),
    userAgent: DataTypes.STRING(512),
  }, { tableName: 'admin_audit_logs', updatedAt: false });

  AdminAuditLog.associate = (models) => {
    AdminAuditLog.belongsTo(models.AdminUser, { foreignKey: 'adminId', constraints: false });
  };

  return AdminAuditLog;
};
