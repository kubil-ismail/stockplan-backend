'use strict';

module.exports = (sequelize, DataTypes) => {
  const PortfolioLog = sequelize.define('PortfolioLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    text: { type: DataTypes.STRING(300), allowNull: false },
    groupName: { type: DataTypes.STRING(80), allowNull: false },
    kind: { type: DataTypes.STRING(10), allowNull: false },
  }, { tableName: 'portfolio_logs' });

  PortfolioLog.associate = (models) => {
    PortfolioLog.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
  };

  return PortfolioLog;
};
