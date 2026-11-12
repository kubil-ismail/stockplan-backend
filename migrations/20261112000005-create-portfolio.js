'use strict';

// Portofolio client (HANDOFF §6.5): catatan pribadi berbasis modal, tanpa eksekusi order.
// Semua tabel milik user → ON DELETE CASCADE. `ticker` sengaja tanpa FK ke market_companies: emiten yang dihapus admin
// tidak boleh ikut menghapus catatan milik pengguna (barisnya tetap tampil sebagai kode saja).
// Kolom tesis/target bobot belum ada: ditambahkan bersama modul Tesis.
module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };
    const user = { type: Sequelize.UUID, allowNull: false, references: { model: 'auth_users', key: 'id' }, onDelete: 'CASCADE' };

    await queryInterface.createTable('portfolio_holdings', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      userId: user,
      ticker: { type: Sequelize.STRING(8), allowNull: false },
      lots: { type: Sequelize.INTEGER, allowNull: false }, // 1 lot = 100 lembar
      avgPrice: { type: Sequelize.INTEGER, allowNull: false }, // Rupiah per lembar
      ...ts,
    });
    await queryInterface.addIndex('portfolio_holdings', ['userId', 'ticker'], { unique: true });
    await queryInterface.addConstraint('portfolio_holdings', { type: 'check', fields: ['lots'], where: { lots: { [Sequelize.Op.gt]: 0 } }, name: 'portfolio_holdings_lots_positive' });
    await queryInterface.addConstraint('portfolio_holdings', { type: 'check', fields: ['avgPrice'], where: { avgPrice: { [Sequelize.Op.gt]: 0 } }, name: 'portfolio_holdings_price_positive' });

    // Satu baris per user, dibuat saat pertama kali ada perubahan dana. Dikunci (FOR UPDATE) oleh setiap perubahan portofolio.
    await queryInterface.createTable('portfolio_balances', {
      userId: { ...user, primaryKey: true },
      cash: { type: Sequelize.BIGINT, allowNull: false, defaultValue: 0 }, // Rupiah
      ...ts,
    });
    await queryInterface.addConstraint('portfolio_balances', { type: 'check', fields: ['cash'], where: { cash: { [Sequelize.Op.gte]: 0 } }, name: 'portfolio_balances_cash_nonnegative' });

    // "Riwayat keputusan": append-only. `groupName` = nama tesis, "Tanpa tesis", atau "Dana tunai".
    await queryInterface.createTable('portfolio_logs', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      userId: user,
      text: { type: Sequelize.STRING(300), allowNull: false },
      groupName: { type: Sequelize.STRING(80), allowNull: false },
      kind: { type: Sequelize.STRING(10), allowNull: false }, // rv | add | out | neutral
      ...ts,
    });
    await queryInterface.addIndex('portfolio_logs', ['userId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('portfolio_logs');
    await queryInterface.dropTable('portfolio_balances');
    await queryInterface.dropTable('portfolio_holdings');
  },
};
