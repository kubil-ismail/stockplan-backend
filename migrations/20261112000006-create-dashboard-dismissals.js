'use strict';

// Beranda "Selesai": hides one action card for that user. `key` = the action id (e.g. suspension-UNTR-2026-11-03), so a
// new event on the same stock (new `since`) is a new key and shows up again.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('dashboard_dismissals', {
      userId: { type: Sequelize.UUID, primaryKey: true, allowNull: false, references: { model: 'auth_users', key: 'id' }, onDelete: 'CASCADE' },
      key: { type: Sequelize.STRING(120), primaryKey: true, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('dashboard_dismissals');
  },
};
