'use strict';

module.exports = (sequelize, DataTypes) => {
  const SyncJob = sequelize.define('SyncJob', {
    key: { type: DataTypes.STRING(20), primaryKey: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    description: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
    schedule: { type: DataTypes.STRING(60), allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // display order
    nextRunAt: DataTypes.DATE,
    requestedAt: DataTypes.DATE,
    requestedTickers: DataTypes.JSONB,
    runningSince: DataTypes.DATE,
    lastStartedAt: DataTypes.DATE,
    lastFinishedAt: DataTypes.DATE,
    lastOk: DataTypes.INTEGER,
    lastTotal: DataTypes.INTEGER,
    lastDetail: DataTypes.STRING(120),
    note: DataTypes.STRING(120),
  }, { tableName: 'sync_jobs' });

  SyncJob.associate = (models) => {
    SyncJob.hasMany(models.SyncFailure, { as: 'failures', foreignKey: 'jobKey' });
  };

  return SyncJob;
};
