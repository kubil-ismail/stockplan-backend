'use strict';

module.exports = (sequelize, DataTypes) => {
  const PortfolioBalance = sequelize.define('PortfolioBalance', {
    userId: { type: DataTypes.UUID, primaryKey: true },
    cash: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, // pg returns BIGINT as string; see lib/portfolio.js
  }, { tableName: 'portfolio_balances' });

  PortfolioBalance.associate = (models) => {
    PortfolioBalance.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
  };

  return PortfolioBalance;
};
