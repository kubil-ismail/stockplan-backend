'use strict';

// An industry (IDX-IC) is both the row on the sector page (TemaSektor) and, once published, its value chain
// (/themes/:slug, admin "Tema & rantai nilai"). Columns hold published values; admin edits live in `draft`.
module.exports = (sequelize, DataTypes) => {
  const Industry = sequelize.define('Industry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    subsectorId: { type: DataTypes.UUID, allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    icon: DataTypes.STRING(40), // lib/adminThemes.js SECTOR_ICONS
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // 'soon' = "Segera hadir"; 'ready' shows as "Siap" or "Baru" (see lib/sectors.js).
    dataStatus: { type: DataTypes.ENUM('soon', 'ready'), allowNull: false, defaultValue: 'soon' },
    dataUpdatedAt: DataTypes.DATE,
    updateNote: DataTypes.STRING, // banner: "Data baru: industri X <updateNote>."
    themeSlug: DataTypes.STRING(80), // legacy, no longer read: the industry itself is the theme
    description: DataTypes.TEXT,
    // Admin workflow label only. Sector page visibility = listedAt; value chain visibility = publishedAt.
    status: { type: DataTypes.ENUM('draft', 'review', 'published'), allowNull: false, defaultValue: 'draft' },
    drivers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    groups: DataTypes.JSONB, // NULL = default hulu/tengah/hilir (lib/themes.js DEFAULT_GROUPS)
    draft: DataTypes.JSONB,
    publishedAt: DataTypes.DATE,
    listedAt: DataTypes.DATE,
    updatedByName: DataTypes.STRING,
  }, { tableName: 'theme_industries' });

  Industry.associate = (models) => {
    Industry.belongsTo(models.Subsector, { as: 'subsector', foreignKey: 'subsectorId' });
    Industry.hasMany(models.ThemeStage, { as: 'stages', foreignKey: 'industryId', onDelete: 'CASCADE' });
  };

  return Industry;
};
