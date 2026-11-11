'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };
    const adminId = (allowNull, onDelete) => ({
      type: Sequelize.UUID, allowNull, references: { model: 'admin_users', key: 'id' }, onDelete,
    });

    await queryInterface.createTable('admin_users', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      passwordHash: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.STRING(40), allowNull: false, defaultValue: 'view' }, // id peran: super|data|tema|support|view
      status: { type: Sequelize.STRING(20), allowNull: false, defaultValue: 'active' }, // active|suspended
      totpSecret: { type: Sequelize.STRING, allowNull: false },
      backupCodes: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] }, // SHA-256 per kode, dihapus saat dipakai
      ...ts,
    });

    await queryInterface.createTable('admin_sessions', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      adminId: adminId(false, 'CASCADE'),
      tokenHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      verified: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, // false = baru lewat langkah 1
      userAgent: { type: Sequelize.STRING(512) },
      ip: { type: Sequelize.STRING(64) },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });

    await queryInterface.createTable('admin_trusted_devices', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      adminId: adminId(false, 'CASCADE'),
      tokenHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      userAgent: { type: Sequelize.STRING(512) },
      ip: { type: Sequelize.STRING(64) },
      expiresAt: { type: Sequelize.DATE, allowNull: false },
      ...ts,
    });

    // Fondasi Riwayat perubahan; baris tetap ada walau admin dihapus.
    await queryInterface.createTable('admin_audit_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      adminId: adminId(true, 'SET NULL'),
      email: { type: Sequelize.STRING, allowNull: false },
      action: { type: Sequelize.STRING(40), allowNull: false },
      ip: { type: Sequelize.STRING(64) },
      userAgent: { type: Sequelize.STRING(512) },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('admin_audit_logs', ['email', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('admin_audit_logs');
    await queryInterface.dropTable('admin_trusted_devices');
    await queryInterface.dropTable('admin_sessions');
    await queryInterface.dropTable('admin_users');
  },
};
