'use strict';

module.exports = (sequelize, DataTypes) => {
  const AdminRole = sequelize.define('AdminRole', {
    id: { type: DataTypes.STRING(40), primaryKey: true }, // referenced by admin_users.role
    name: { type: DataTypes.STRING(60), allowNull: false, unique: true },
    summary: DataTypes.STRING(120),
    description: DataTypes.STRING(300),
    system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // "Peran bawaan"
    perms: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }, // ignored for `super` (lib/adminRoles.js permsOf)
  }, { tableName: 'admin_roles' });

  return AdminRole;
};
