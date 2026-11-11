'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // DB defaults keep every existing/seeded company published; admin-created ones set draft + publishedAt NULL explicitly.
    await queryInterface.addColumn('market_companies', 'publishStatus', { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'published' }); // draft | review | published
    await queryInterface.addColumn('market_companies', 'publishedAt', { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') }); // NULL = never published, hidden from customers
    await queryInterface.addColumn('market_companies', 'draft', { type: Sequelize.JSONB, allowNull: true }); // unpublished admin edits (form snapshot)
    await queryInterface.addColumn('market_companies', 'updatedByName', { type: Sequelize.STRING, allowNull: true }); // NULL = "Sistem"
    await queryInterface.addIndex('market_companies', ['publishStatus']);
    await queryInterface.addColumn('admin_audit_logs', 'target', { type: Sequelize.STRING(80), allowNull: true }); // e.g. ticker
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('admin_audit_logs', 'target');
    await queryInterface.removeColumn('market_companies', 'updatedByName');
    await queryInterface.removeColumn('market_companies', 'draft');
    await queryInterface.removeColumn('market_companies', 'publishedAt');
    await queryInterface.removeColumn('market_companies', 'publishStatus');
  },
};
