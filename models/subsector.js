'use strict';

module.exports = (sequelize, DataTypes) => {
  const Subsector = sequelize.define('Subsector', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sectorId: { type: DataTypes.UUID, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  }, { tableName: 'theme_subsectors' });

  Subsector.associate = (models) => {
    Subsector.belongsTo(models.Sector, { as: 'sector', foreignKey: 'sectorId' });
    Subsector.hasMany(models.Industry, { as: 'industries', foreignKey: 'subsectorId', onDelete: 'CASCADE' });
  };

  return Subsector;
};
