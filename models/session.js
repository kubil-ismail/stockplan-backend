'use strict';

module.exports = (sequelize, DataTypes) => {
  const Session = sequelize.define('Session', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    userAgent: DataTypes.STRING(512),
    ip: DataTypes.STRING(64),
    expiresAt: { type: DataTypes.DATE, allowNull: false },
  }, { tableName: 'auth_sessions' });

  Session.associate = (models) => {
    Session.belongsTo(models.User, { foreignKey: 'userId' });
  };

  return Session;
};
