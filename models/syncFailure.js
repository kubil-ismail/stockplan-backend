'use strict';

module.exports = (sequelize, DataTypes) => {
  const SyncFailure = sequelize.define('SyncFailure', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobKey: { type: DataTypes.STRING(20), allowNull: false },
    ticker: DataTypes.STRING(8),
    message: { type: DataTypes.STRING(200), allowNull: false },
    log: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
    resolvedAt: DataTypes.DATE,
  }, { tableName: 'sync_failures' });

  SyncFailure.associate = (models) => {
    SyncFailure.belongsTo(models.SyncJob, { as: 'job', foreignKey: 'jobKey', onDelete: 'CASCADE' });
  };

  return SyncFailure;
};
