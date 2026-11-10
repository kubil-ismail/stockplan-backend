'use strict';

module.exports = (sequelize, DataTypes) => {
  const ThemeStage = sequelize.define('ThemeStage', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    themeId: { type: DataTypes.UUID, allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false }, // 1-based: "Tahap 2 dari 5"
    groupKey: { type: DataTypes.STRING(40), allowNull: false }, // hulu | tengah | hilir
    name: { type: DataTypes.STRING, allowNull: false },
    shortName: DataTypes.STRING,
    description: DataTypes.TEXT,
    tickers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, // ordered; a ticker may sit in several stages
  }, { tableName: 'theme_stages' });

  ThemeStage.associate = (models) => {
    ThemeStage.belongsTo(models.Theme, { as: 'theme', foreignKey: 'themeId' });
  };

  return ThemeStage;
};
