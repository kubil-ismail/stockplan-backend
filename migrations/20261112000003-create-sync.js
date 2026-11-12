'use strict';

// Sinkron data BEI (AdminSinkron). The crawler (stock-plan-crawler) polls the queue and reports each run;
// admins see jobs, failures, and BEI values that differ from team edits (conflicts).
// Jobs are reference rows (design "Jadwal sinkron"), so they are inserted here, not in a seeder.
const JOBS = [
  ['prof', 'Profil perusahaan', 'Nama, alamat, papan, sektor IDX-IC', 'Harian 06.00'],
  ['px', 'Harga penutupan', 'Dipakai untuk nilai portofolio, bukan real time', 'Hari bursa 17.30'],
  ['sub', 'Anak usaha', 'Daftar dan persentase kepemilikan', 'Harian 06.00'],
  ['mgmt', 'Manajemen', 'Direksi dan komisaris', 'Harian 06.00'],
  ['idx', 'Category index', 'Klasifikasi IDX-IC dan indeks', 'Mingguan, Senin 06.00'],
  ['kip', 'Keterbukaan informasi', 'Pengumuman emiten untuk “Perubahan bisnis”', 'Tiap 30 menit, jam bursa'],
  ['lk', 'Laporan keuangan (XBRL)', 'Laporan kuartalan dan tahunan', 'Harian 07.00'],
  ['ipo', 'Pencatatan & IPO', 'Emiten baru dan jadwal penawaran umum', 'Harian 06.00'],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };
    const job = { type: Sequelize.STRING(20), allowNull: false, references: { model: 'sync_jobs', key: 'key' }, onDelete: 'CASCADE' };

    await queryInterface.createTable('sync_jobs', {
      key: { type: Sequelize.STRING(20), primaryKey: true },
      name: { type: Sequelize.STRING(80), allowNull: false },
      description: { type: Sequelize.STRING(200), allowNull: false, defaultValue: '' },
      schedule: { type: Sequelize.STRING(60), allowNull: false }, // label only; the crawler owns the cron
      nextRunAt: { type: Sequelize.DATE },
      requestedAt: { type: Sequelize.DATE }, // "Jalankan sekarang" / "Coba lagi" waiting for the crawler
      requestedTickers: { type: Sequelize.JSONB }, // null = full run; ["BUMI"] = retry only these
      runningSince: { type: Sequelize.DATE },
      lastStartedAt: { type: Sequelize.DATE }, // last FULL run only
      lastFinishedAt: { type: Sequelize.DATE },
      lastOk: { type: Sequelize.INTEGER },
      lastTotal: { type: Sequelize.INTEGER },
      lastDetail: { type: Sequelize.STRING(120) }, // e.g. "14 dokumen baru" instead of "958 emiten"
      note: { type: Sequelize.STRING(120) }, // e.g. "23 laporan belum diproses tim"
      ...ts,
    });

    await queryInterface.createTable('sync_failures', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      jobKey: job,
      ticker: { type: Sequelize.STRING(8) }, // no FK: BEI may list tickers we don't have yet; null = whole job failed
      message: { type: Sequelize.STRING(200), allowNull: false },
      log: { type: Sequelize.STRING(500), allowNull: false, defaultValue: '' },
      resolvedAt: { type: Sequelize.DATE },
      ...ts,
    });
    await queryInterface.addIndex('sync_failures', ['jobKey', 'resolvedAt']);
    await queryInterface.addIndex('sync_failures', ['createdAt']);

    await queryInterface.createTable('sync_conflicts', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      jobKey: job,
      ticker: { type: Sequelize.STRING(8), allowNull: false, references: { model: 'market_companies', key: 'ticker' }, onDelete: 'CASCADE' },
      section: { type: Sequelize.STRING(30), allowNull: false }, // company form section key, e.g. management
      field: { type: Sequelize.STRING(100), allowNull: false },
      reason: { type: Sequelize.STRING(300), allowNull: false, defaultValue: '' },
      value: { type: Sequelize.JSONB, allowNull: false }, // BEI value for the whole section, already validated
      resolvedAt: { type: Sequelize.DATE },
      resolution: { type: Sequelize.STRING(10) }, // bei | team
      resolvedById: { type: Sequelize.UUID, references: { model: 'admin_users', key: 'id' }, onDelete: 'SET NULL' },
      ...ts,
    });
    await queryInterface.addIndex('sync_conflicts', ['ticker', 'section'], { unique: true, where: { resolvedAt: null }, name: 'sync_conflicts_open_unique' });

    const now = new Date();
    await queryInterface.bulkInsert('sync_jobs', JOBS.map(([key, name, description, schedule]) => ({ key, name, description, schedule, createdAt: now, updatedAt: now })));
  },

  async down(queryInterface) {
    await queryInterface.dropTable('sync_conflicts');
    await queryInterface.dropTable('sync_failures');
    await queryInterface.dropTable('sync_jobs');
  },
};
