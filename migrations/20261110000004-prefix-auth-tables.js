'use strict';

// Table naming convention: <domain>_<plural>, snake_case (auth_, later thesis_, portfolio_, watchlist_, admin_...).
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameTable('Users', 'auth_users');
    await queryInterface.renameTable('Sessions', 'auth_sessions');
    await queryInterface.sequelize.query('ALTER TYPE "enum_Users_plan" RENAME TO "enum_auth_users_plan";');
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('ALTER TYPE "enum_auth_users_plan" RENAME TO "enum_Users_plan";');
    await queryInterface.renameTable('auth_sessions', 'Sessions');
    await queryInterface.renameTable('auth_users', 'Users');
  },
};
