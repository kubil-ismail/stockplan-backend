'use strict';

const { DEFAULT_PREFS, withDefaults } = require('../lib/prefs');

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING, allowNull: false },
    emailVerified: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    plan: { type: DataTypes.ENUM('beta', 'monthly', 'yearly'), allowNull: false, defaultValue: 'beta' },
    experience: DataTypes.STRING,
    horizon: DataTypes.STRING,
    interestedThemes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    passwordChangedAt: DataTypes.DATE,
    pendingEmail: DataTypes.STRING,
    pendingEmailTokenHash: DataTypes.STRING(64),
    pendingEmailExpiresAt: DataTypes.DATE,
    prefs: { type: DataTypes.JSONB, allowNull: false, defaultValue: () => withDefaults(DEFAULT_PREFS) },
  }, { tableName: 'auth_users' });

  User.associate = (models) => {
    User.hasMany(models.Session, { foreignKey: 'userId', onDelete: 'CASCADE' });
  };

  // Never send passwordHash to the client.
  User.prototype.toJSON = function () {
    const { id, name, email, emailVerified, plan, prefs, experience, horizon, interestedThemes, passwordChangedAt, pendingEmail } = this.get();
    return { id, name, email, pendingEmail, emailVerified, plan, prefs: withDefaults(prefs), experience, horizon, interestedThemes, passwordChangedAt };
  };

  return User;
};
