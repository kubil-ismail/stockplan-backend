'use strict';

// IDX-IC hierarchy: sector → subsector → industry (design: Tema, TemaSektor).
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = {
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    };
    await queryInterface.createTable('theme_sectors', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      icon: { type: Sequelize.STRING(40) },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.createTable('theme_subsectors', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      sectorId: { type: Sequelize.UUID, allowNull: false, references: { model: 'theme_sectors', key: 'id' }, onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING, allowNull: false },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      ...ts,
    });
    await queryInterface.createTable('theme_industries', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      subsectorId: { type: Sequelize.UUID, allowNull: false, references: { model: 'theme_subsectors', key: 'id' }, onDelete: 'CASCADE' },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      icon: { type: Sequelize.STRING(40) },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      dataStatus: { type: Sequelize.ENUM('soon', 'ready'), allowNull: false, defaultValue: 'soon' },
      dataUpdatedAt: { type: Sequelize.DATE },
      updateNote: { type: Sequelize.STRING },
      themeSlug: { type: Sequelize.STRING(80) },
      ...ts,
    });
    await queryInterface.addIndex('theme_subsectors', ['sectorId']);
    await queryInterface.addIndex('theme_industries', ['subsectorId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('theme_industries');
    await queryInterface.dropTable('theme_subsectors');
    await queryInterface.dropTable('theme_sectors');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_theme_industries_dataStatus";');
  },
};
