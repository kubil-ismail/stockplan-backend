'use strict';

module.exports = (sequelize, DataTypes) => {
  const ThemeStage = sequelize.define('ThemeStage', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    industryId: { type: DataTypes.UUID, allowNull: false }, // the industry whose value chain this stage belongs to
    order: { type: DataTypes.INTEGER, allowNull: false }, // 1-based: "Tahap 2 dari 5"
    groupKey: { type: DataTypes.STRING(40), allowNull: false }, // hulu | tengah | hilir
    name: { type: DataTypes.STRING, allowNull: false },
    shortName: DataTypes.STRING,
    description: DataTypes.TEXT,
    tickers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // ordered; a ticker may sit in several stages
    shares: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }, // { TICKER: { pct, source } } revenue share from this stage
  }, { tableName: 'theme_stages' });

  ThemeStage.associate = (models) => {
    ThemeStage.belongsTo(models.Industry, { as: 'theme', foreignKey: 'industryId' }); // alias kept: the industry is the theme
  };

  return ThemeStage;
};
