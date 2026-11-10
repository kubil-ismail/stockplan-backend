'use strict';

module.exports = (sequelize, DataTypes) => {
  const CompanyAlert = sequelize.define('CompanyAlert', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    ticker: { type: DataTypes.STRING(8), allowNull: false },
    kind: { type: DataTypes.ENUM('listing', 'data_update'), allowNull: false },
  }, { tableName: 'market_company_alerts' });

  CompanyAlert.associate = (models) => {
    CompanyAlert.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
    CompanyAlert.belongsTo(models.Company, { as: 'company', foreignKey: 'ticker' });
  };

  return CompanyAlert;
};
