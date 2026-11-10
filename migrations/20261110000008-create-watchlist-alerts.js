'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };
    const user = { type: Sequelize.UUID, allowNull: false, references: { model: 'auth_users', key: 'id' }, onDelete: 'CASCADE' };
    const ticker = { type: Sequelize.STRING(8), allowNull: false, references: { model: 'market_companies', key: 'ticker' }, onDelete: 'CASCADE' };

    // Watchlist (types.ts WatchItem). Stage baru/pel/siap is computed from checklist, not stored.
    await queryInterface.createTable('watchlist_items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      userId: user,
      ticker,
      themeName: { type: Sequelize.STRING },
      note: { type: Sequelize.TEXT, allowNull: false, defaultValue: '' },
      checklist: { type: Sequelize.JSONB, allowNull: false, defaultValue: [false, false, false, false] },
      touchedAt: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('watchlist_items', ['userId', 'ticker'], { unique: true });

    // Per-user "Kabari saat diperbarui" (data_update) and "Ingatkan saat tercatat" (listing).
    await queryInterface.createTable('market_company_alerts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      userId: user,
      ticker,
      kind: { type: Sequelize.ENUM('listing', 'data_update'), allowNull: false },
      ...ts,
    });
    await queryInterface.addIndex('market_company_alerts', ['userId', 'ticker', 'kind'], { unique: true });
    await queryInterface.addIndex('market_company_alerts', ['ticker', 'kind']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('market_company_alerts');
    await queryInterface.dropTable('watchlist_items');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_market_company_alerts_kind";');
  },
};
