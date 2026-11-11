'use strict';

module.exports = (sequelize, DataTypes) => {
  const AdminTrustedDevice = sequelize.define('AdminTrustedDevice', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    adminId: { type: DataTypes.UUID, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    userAgent: DataTypes.STRING(512),
    ip: DataTypes.STRING(64),
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  }, { tableName: 'admin_trusted_devices' });

  return AdminTrustedDevice;
};
