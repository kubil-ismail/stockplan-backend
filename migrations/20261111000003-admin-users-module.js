'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = 'auth_users';
    await queryInterface.addColumn(t, 'lastActiveAt', { type: Sequelize.DATE, allowNull: true }); // "Terakhir aktif"
    await queryInterface.addColumn(t, 'suspendedAt', { type: Sequelize.DATE, allowNull: true }); // NULL = akun normal
    await queryInterface.addColumn(t, 'suspendReason', { type: Sequelize.STRING(80), allowNull: true });
    await queryInterface.addColumn(t, 'suspendNote', { type: Sequelize.TEXT, allowNull: true }); // internal, tidak dikirim ke pengguna
    await queryInterface.addColumn(t, 'suspendedBy', { type: Sequelize.STRING, allowNull: true }); // nama admin
    await queryInterface.addColumn(t, 'passwordResetTokenHash', { type: Sequelize.STRING(64), allowNull: true });
    await queryInterface.addColumn(t, 'passwordResetExpiresAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addIndex(t, ['passwordResetTokenHash']);
    await queryInterface.sequelize.query(
      'UPDATE auth_users u SET "lastActiveAt" = s.m FROM (SELECT "userId", MAX("updatedAt") AS m FROM auth_sessions GROUP BY "userId") s WHERE s."userId" = u.id',
    );
  },

  async down(queryInterface) {
    const t = 'auth_users';
    for (const c of ['passwordResetExpiresAt', 'passwordResetTokenHash', 'suspendedBy', 'suspendNote', 'suspendReason', 'suspendedAt', 'lastActiveAt']) {
      await queryInterface.removeColumn(t, c);
    }
  },
};
