'use strict';

module.exports = (sequelize, DataTypes) => {
  const DashboardDismissal = sequelize.define('DashboardDismissal', {
    userId: { type: DataTypes.UUID, primaryKey: true },
    key: { type: DataTypes.STRING(120), primaryKey: true },
  }, { tableName: 'dashboard_dismissals' });

  DashboardDismissal.associate = (models) => {
    DashboardDismissal.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
  };

  return DashboardDismissal;
};
