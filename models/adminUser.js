'use strict';

module.exports = (sequelize, DataTypes) => {
  const AdminUser = sequelize.define('AdminUser', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: DataTypes.STRING, // NULL until an invite is accepted
    role: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'view' },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' }, // invited | active | disabled
    // shortcut: TOTP secret disimpan polos, upgrade: enkripsi AES-GCM dengan kunci dari env sebelum production.
    totpSecret: DataTypes.STRING, // NULL until an invite is accepted
    twoFactorEnabledAt: DataTypes.DATE, // first successful 2FA
    inviteTokenHash: DataTypes.STRING(64),
    inviteExpiresAt: DataTypes.DATE,
    invitedAt: DataTypes.DATE,
    invitedBy: DataTypes.STRING,
    disabledAt: DataTypes.DATE,
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
