'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Users', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      passwordHash: { type: Sequelize.STRING, allowNull: false },
      emailVerified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      plan: { type: Sequelize.ENUM('beta', 'monthly', 'yearly'), allowNull: false, defaultValue: 'beta' },
      prefs: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('Sessions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'Users', key: 'id' },
        onDelete: 'CASCADE',
      },
      tokenHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      userAgent: { type: Sequelize.STRING(512) },
      ip: { type: Sequelize.STRING(64) },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('Sessions');
    await queryInterface.dropTable('Users');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_Users_plan";');
  },
};
