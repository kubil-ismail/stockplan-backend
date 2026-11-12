'use strict';

module.exports = (sequelize, DataTypes) => {
  const SyncConflict = sequelize.define('SyncConflict', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    jobKey: { type: DataTypes.STRING(20), allowNull: false },
    ticker: { type: DataTypes.STRING(8), allowNull: false },
    section: { type: DataTypes.STRING(30), allowNull: false },
    field: { type: DataTypes.STRING(100), allowNull: false },
    reason: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
    value: { type: DataTypes.JSONB, allowNull: false },
    resolvedAt: DataTypes.DATE,
    resolution: DataTypes.STRING(10),
    resolvedById: DataTypes.UUID,
  }, { tableName: 'sync_conflicts' });

  SyncConflict.associate = (models) => {
    SyncConflict.belongsTo(models.SyncJob, { as: 'job', foreignKey: 'jobKey', onDelete: 'CASCADE' });
    SyncConflict.belongsTo(models.Company, { as: 'company', foreignKey: 'ticker', onDelete: 'CASCADE' });
  };

  return SyncConflict;
};
