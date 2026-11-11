'use strict';

module.exports = (sequelize, DataTypes) => {
  const AdminSession = sequelize.define('AdminSession', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminId: { type: DataTypes.UUID, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    verified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    userAgent: DataTypes.STRING(512),
    ip: DataTypes.STRING(64),
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  }, { tableName: 'admin_sessions' });

  AdminSession.associate = (models) => {
    AdminSession.belongsTo(models.AdminUser, { foreignKey: 'adminId' });
  };

  return AdminSession;
};
