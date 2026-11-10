'use strict';

module.exports = (sequelize, DataTypes) => {
  const Sector = sequelize.define('Sector', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    name: { type: DataTypes.STRING, allowNull: false },
    icon: DataTypes.STRING(40),
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, { tableName: 'theme_sectors' });

  Sector.associate = (models) => {
    Sector.hasMany(models.Subsector, { as: 'subsectors', foreignKey: 'sectorId', onDelete: 'CASCADE' });
  };

  return Sector;
};
