'use strict';

module.exports = (sequelize, DataTypes) => {
  const Industry = sequelize.define('Industry', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    subsectorId: { type: DataTypes.UUID, allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    icon: DataTypes.STRING(40),
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    // 'soon' = "Segera hadir"; 'ready' shows as "Siap" or "Baru" (see lib/sectors.js).
    dataStatus: { type: DataTypes.ENUM('soon', 'ready'), allowNull: false, defaultValue: 'soon' },
    dataUpdatedAt: DataTypes.DATE,
    updateNote: DataTypes.STRING, // banner: "Data baru: industri X <updateNote>."
    themeSlug: DataTypes.STRING(80), // value-chain theme (/tema/[slug]) when one exists
  }, { tableName: 'theme_industries' });

  Industry.associate = (models) => {
    Industry.belongsTo(models.Subsector, { as: 'subsector', foreignKey: 'subsectorId' });
  };

  return Industry;
};
