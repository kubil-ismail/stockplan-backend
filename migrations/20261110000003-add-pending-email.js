'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Users', 'pendingEmail', { type: Sequelize.STRING });
    await queryInterface.addColumn('Users', 'pendingEmailTokenHash', { type: Sequelize.STRING(64) });
    await queryInterface.addColumn('Users', 'pendingEmailExpiresAt', { type: Sequelize.DATE });
  },

  async down(queryInterface) {
    for (const c of ['pendingEmail', 'pendingEmailTokenHash', 'pendingEmailExpiresAt']) {
      await queryInterface.removeColumn('Users', c);
    }
  },
};
