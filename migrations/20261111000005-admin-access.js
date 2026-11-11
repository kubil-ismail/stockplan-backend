'use strict';

// Akses & peran (AdminAkses, AdminAksesPeran): roles move from a static file to a table, members get an
// invite / active / disabled lifecycle. Built-in roles: stockplan-app-handoff/fixtures/admin-roles.json.
const ROLES = [
  { id: 'super', name: 'Super admin', summary: 'Semua izin, termasuk akses', system: true, description: 'Punya semua izin dan tidak bisa diubah. Batasi ke 1–2 orang.',
    perms: { dash: ['view'], em: ['view', 'edit', 'publish', 'delete'], tm: ['view', 'edit', 'publish', 'delete'], usr: ['view', 'edit', 'delete'], fb: ['view', 'edit', 'delete'], log: ['view', 'edit'], sync: ['view', 'edit'], set: ['view', 'edit', 'publish'], acc: ['view', 'edit', 'delete'] } },
  { id: 'data', name: 'Admin data', summary: 'Emiten, tema, sinkron', system: true, description: 'Mengurus data emiten dan tema sampai terbit. Tidak bisa mengatur akses atau pengaturan aplikasi.',
    perms: { dash: ['view'], em: ['view', 'edit', 'publish', 'delete'], tm: ['view', 'edit', 'publish'], usr: ['view'], fb: ['view', 'edit'], log: ['view'], sync: ['view', 'edit'], set: ['view'], acc: [] } },
  { id: 'tema', name: 'Editor tema', summary: 'Tema dan rantai nilai saja', system: false, description: 'Menyusun tema dan rantai nilai. Perubahannya harus diterbitkan Admin data.',
    perms: { dash: ['view'], em: ['view'], tm: ['view', 'edit'], usr: [], fb: [], log: ['view'], sync: [], set: [], acc: [] } },
  { id: 'support', name: 'Support', summary: 'Masukan dan pengguna', system: false, description: 'Membalas tiket dan membantu pengguna. Tidak bisa mengubah data emiten.',
    perms: { dash: ['view'], em: ['view'], tm: [], usr: ['view', 'edit', 'delete'], fb: ['view', 'edit', 'delete'], log: ['view'], sync: [], set: [], acc: [] } },
  { id: 'view', name: 'Viewer', summary: 'Hanya melihat', system: false, description: 'Bisa melihat semua modul kecuali akses, tanpa mengubah apa pun.',
    perms: { dash: ['view'], em: ['view'], tm: ['view'], usr: ['view'], fb: ['view'], log: ['view'], sync: ['view'], set: ['view'], acc: [] } },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('admin_roles', {
      id: { type: Sequelize.STRING(40), primaryKey: true, allowNull: false },
      name: { type: Sequelize.STRING(60), allowNull: false, unique: true },
      summary: { type: Sequelize.STRING(120), allowNull: true }, // short line under the name in the role list
      description: { type: Sequelize.STRING(300), allowNull: true },
      system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }, // "Peran bawaan"
      perms: { type: Sequelize.JSONB, allowNull: false, defaultValue: {} }, // { moduleKey: [actions] }
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    const now = new Date();
    await queryInterface.bulkInsert('admin_roles', ROLES.map((r) => ({ ...r, perms: JSON.stringify(r.perms), createdAt: now, updatedAt: now })));

    const t = 'admin_users';
    // Invited members have no password or TOTP until they accept.
    await queryInterface.changeColumn(t, 'passwordHash', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.changeColumn(t, 'totpSecret', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn(t, 'twoFactorEnabledAt', { type: Sequelize.DATE, allowNull: true }); // set on first successful 2FA
    await queryInterface.addColumn(t, 'inviteTokenHash', { type: Sequelize.STRING(64), allowNull: true });
    await queryInterface.addColumn(t, 'inviteExpiresAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn(t, 'invitedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn(t, 'invitedBy', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn(t, 'disabledAt', { type: Sequelize.DATE, allowNull: true });
    // status: invited | active | disabled ("suspended" was never set by code; folded into disabled).
    await queryInterface.sequelize.query(`UPDATE admin_users SET status = 'disabled', "disabledAt" = NOW() WHERE status = 'suspended'`);
    await queryInterface.sequelize.query(`UPDATE admin_users SET "twoFactorEnabledAt" = "createdAt" WHERE "totpSecret" IS NOT NULL`);
    await queryInterface.addIndex(t, ['inviteTokenHash']);
    await queryInterface.addConstraint(t, {
      fields: ['role'], type: 'foreign key', name: 'admin_users_role_fkey',
      references: { table: 'admin_roles', field: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT',
    });
  },

  async down(queryInterface, Sequelize) {
    const t = 'admin_users';
    await queryInterface.removeConstraint(t, 'admin_users_role_fkey');
    for (const c of ['disabledAt', 'invitedBy', 'invitedAt', 'inviteExpiresAt', 'inviteTokenHash', 'twoFactorEnabledAt']) await queryInterface.removeColumn(t, c);
    await queryInterface.sequelize.query(`UPDATE admin_users SET status = 'suspended' WHERE status = 'disabled'`);
    await queryInterface.changeColumn(t, 'totpSecret', { type: Sequelize.STRING, allowNull: false });
    await queryInterface.changeColumn(t, 'passwordHash', { type: Sequelize.STRING, allowNull: false });
    await queryInterface.dropTable('admin_roles');
  },
};
