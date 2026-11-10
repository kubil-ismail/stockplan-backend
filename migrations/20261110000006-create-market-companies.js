'use strict';

// Listed and IPO companies (emiten). Queryable fields are columns; editorial page content lives in JSONB.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('market_companies', {
      ticker: { type: Sequelize.STRING(8), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      sectorId: { type: Sequelize.UUID, references: { model: 'theme_sectors', key: 'id' }, onDelete: 'SET NULL' },
      industryId: { type: Sequelize.UUID, references: { model: 'theme_industries', key: 'id' }, onDelete: 'SET NULL' },
      logoUrl: { type: Sequelize.STRING },
      status: { type: Sequelize.ENUM('listed', 'ipo', 'suspended'), allowNull: false, defaultValue: 'listed' },
      listingBoard: { type: Sequelize.STRING(40) },
      listedYear: { type: Sequelize.INTEGER },
      groupName: { type: Sequelize.STRING },
      sizeClass: { type: Sequelize.ENUM('small', 'medium', 'large') },
      tagline: { type: Sequelize.STRING },
      summary: { type: Sequelize.TEXT },
      marketCap: { type: Sequelize.BIGINT },
      metrics: { type: Sequelize.JSONB },
      financialPeriod: { type: Sequelize.STRING(20) },
      priceDate: { type: Sequelize.DATEONLY },
      dataDelayed: { type: Sequelize.JSONB },
      profile: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      ipo: { type: Sequelize.JSONB },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('market_companies', ['sectorId']);
    await queryInterface.addIndex('market_companies', ['industryId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('market_companies');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_market_companies_status";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_market_companies_sizeClass";');
  },
};
