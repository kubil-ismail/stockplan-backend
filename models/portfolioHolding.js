'use strict';

module.exports = (sequelize, DataTypes) => {
  const PortfolioHolding = sequelize.define('PortfolioHolding', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    ticker: { type: DataTypes.STRING(8), allowNull: false },
    lots: { type: DataTypes.INTEGER, allowNull: false },
    avgPrice: { type: DataTypes.INTEGER, allowNull: false },
  }, { tableName: 'portfolio_holdings' });

  PortfolioHolding.associate = (models) => {
    PortfolioHolding.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
  };

  return PortfolioHolding;
};
