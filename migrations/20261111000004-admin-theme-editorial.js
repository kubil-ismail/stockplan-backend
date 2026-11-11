'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = 'theme_themes';
    await queryInterface.addColumn(t, 'drivers', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] }); // "Penggerak utama"
    await queryInterface.addColumn(t, 'groups', { type: Sequelize.JSONB, allowNull: true }); // "Tahap utama" [{ key, title, description, icon, color }]; NULL = default hulu/tengah/hilir
    await queryInterface.addColumn(t, 'draft', { type: Sequelize.JSONB, allowNull: true }); // unpublished admin form
    // Visibility for customers (status is now only the admin workflow label). DB default keeps seeded themes visible.
    await queryInterface.addColumn(t, 'publishedAt', { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') });
    await queryInterface.addColumn(t, 'updatedByName', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.sequelize.query(`UPDATE theme_themes SET "publishedAt" = NULL WHERE status <> 'published'`);
    // Per ticker in a stage: { TICKER: { pct, source } } — "Porsi" and "Sumber". `tickers` stays the ordered list.
    await queryInterface.addColumn('theme_stages', 'shares', { type: Sequelize.JSONB, allowNull: false, defaultValue: {} });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('theme_stages', 'shares');
    for (const c of ['updatedByName', 'publishedAt', 'draft', 'groups', 'drivers']) await queryInterface.removeColumn('theme_themes', c);
  },
};
