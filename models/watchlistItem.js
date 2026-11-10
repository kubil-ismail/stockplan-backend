'use strict';

module.exports = (sequelize, DataTypes) => {
  const WatchlistItem = sequelize.define('WatchlistItem', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    ticker: { type: DataTypes.STRING(8), allowNull: false },
    themeName: DataTypes.STRING,
    note: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
    // Bisnis dipahami · Laporan dibaca · Risiko dicatat · Alasan ditulis
    checklist: { type: DataTypes.JSONB, allowNull: false, defaultValue: [false, false, false, false] },
    touchedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  }, { tableName: 'watchlist_items' });

  WatchlistItem.associate = (models) => {
    WatchlistItem.belongsTo(models.User, { foreignKey: 'userId', onDelete: 'CASCADE' });
    WatchlistItem.belongsTo(models.Company, { as: 'company', foreignKey: 'ticker' });
  };

  return WatchlistItem;
};
