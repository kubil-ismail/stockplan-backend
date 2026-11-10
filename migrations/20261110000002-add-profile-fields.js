'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = 'Users';
    await queryInterface.addColumn(t, 'experience', { type: Sequelize.STRING });
    await queryInterface.addColumn(t, 'horizon', { type: Sequelize.STRING });
    await queryInterface.addColumn(t, 'interestedThemes', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
    await queryInterface.addColumn(t, 'passwordChangedAt', { type: Sequelize.DATE });
  },

  async down(queryInterface) {
    for (const c of ['experience', 'horizon', 'interestedThemes', 'passwordChangedAt']) {
      await queryInterface.removeColumn('Users', c);
    }
  },
};
