'use strict';

module.exports = (sequelize, DataTypes) => {
  const AdminUser = sequelize.define('AdminUser', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'view' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    // shortcut: TOTP secret disimpan polos, upgrade: enkripsi AES-GCM dengan kunci dari env sebelum production.
    totpSecret: { type: DataTypes.STRING, allowNull: false },
    backupCodes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  }, { tableName: 'admin_users' });

  AdminUser.associate = (models) => {
    AdminUser.hasMany(models.AdminSession, { foreignKey: 'adminId', onDelete: 'CASCADE' });
    AdminUser.hasMany(models.AdminTrustedDevice, { foreignKey: 'adminId', onDelete: 'CASCADE' });
  };

  AdminUser.prototype.toJSON = function () {
    const { id, name, email, role } = this.get();
    return { id, name, email, role };
  };

  return AdminUser;
};
