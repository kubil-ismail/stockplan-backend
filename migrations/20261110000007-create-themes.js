'use strict';

// Value-chain themes (design: TemaDetail, AdminTemaEdit). Stage tickers are an ordered JSONB array (types.ts Stage.tickers).
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };
    await queryInterface.createTable('theme_themes', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      sectorId: { type: Sequelize.UUID, references: { model: 'theme_sectors', key: 'id' }, onDelete: 'SET NULL' },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('draft', 'review', 'published'), allowNull: false, defaultValue: 'draft' },
      ...ts,
    });
    await queryInterface.createTable('theme_stages', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      themeId: { type: Sequelize.UUID, allowNull: false, references: { model: 'theme_themes', key: 'id' }, onDelete: 'CASCADE' },
      order: { type: Sequelize.INTEGER, allowNull: false },
      groupKey: { type: Sequelize.STRING(40), allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      shortName: { type: Sequelize.STRING },
      description: { type: Sequelize.TEXT },
      tickers: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      ...ts,
    });
    await queryInterface.addIndex('theme_stages', ['themeId', 'order'], { unique: true });
    await queryInterface.sequelize.query('CREATE INDEX theme_stages_tickers_gin ON theme_stages USING GIN (tickers jsonb_path_ops);');
  },

  async down(queryInterface) {
    await queryInterface.dropTable('theme_stages');
    await queryInterface.dropTable('theme_themes');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_theme_themes_status";');
  },
};
