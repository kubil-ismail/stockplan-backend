'use strict';

module.exports = (sequelize, DataTypes) => {
  const Theme = sequelize.define('Theme', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    sectorId: DataTypes.UUID,
    description: DataTypes.TEXT,
    // Admin workflow label only. Customer visibility = publishedAt (NULL = never published).
    status: { type: DataTypes.ENUM('draft', 'review', 'published'), allowNull: false, defaultValue: 'draft' },
    drivers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    groups: DataTypes.JSONB, // NULL = default hulu/tengah/hilir (lib/adminThemes.js DEFAULT_GROUPS)
    draft: DataTypes.JSONB,
    publishedAt: DataTypes.DATE, // no model default on purpose: the DB default only applies to seeds
    updatedByName: DataTypes.STRING,
  }, { tableName: 'theme_themes' });

  Theme.associate = (models) => {
    Theme.belongsTo(models.Sector, { as: 'sector', foreignKey: 'sectorId' });
    Theme.hasMany(models.ThemeStage, { as: 'stages', foreignKey: 'themeId', onDelete: 'CASCADE' });
  };

  return Theme;
};
