'use strict';

// "Jadwal sinkron" (AdminSinkron) jadi 7 baris. Profil perusahaan sekarang mencakup informasi perusahaan, manajemen,
// persentase kepemilikan, dan anak usaha (dulu jadi tiga job: prof/mgmt/sub). Category index dihapus.
// Kegagalan dan kartu tinjauan milik job yang dihapus dipindah ke `prof`, bukan dihapus (FK-nya ON DELETE CASCADE).
// `position` = urutan tampil; sebelumnya urutan jatuh ke createdAt yang sama untuk semua baris.
const LIST = [
  // [key, name, description, schedule (label saja; cron dipegang crawler), position]
  ['prof', 'Profil perusahaan', 'Informasi perusahaan, manajemen, persentase kepemilikan, anak usaha', 'Harian 06.00'],
  ['px', 'Harga penutupan', 'Dipakai untuk nilai portofolio, bukan real time', 'Hari bursa 17.30'],
  ['kip', 'Keterbukaan informasi', 'Pengumuman emiten untuk “Perubahan bisnis”', 'Tiap 30 menit, jam bursa'],
  ['lk', 'Laporan keuangan (XBRL)', 'Laporan kuartalan dan tahunan', 'Harian 07.00'],
  ['ipo', 'Pencatatan & IPO', 'Emiten baru dan jadwal penawaran umum', 'Harian 06.00'],
  ['logo', 'Logo emiten', 'Logo perusahaan untuk avatar emiten', 'Mingguan, Senin 06.00'], // COPY: perlu review (nama dan jadwal)
  ['special', 'Status khusus emiten', 'UMA, suspensi, dan pencatatan khusus', 'Tiap 30 menit, jam bursa'], // COPY: perlu review (nama dan jadwal)
];
const REMOVED = ['sub', 'mgmt', 'idx'];

// Yang dipulihkan `down` (isi migrasi 20261112000003).
const OLD = [
  ['prof', 'Profil perusahaan', 'Nama, alamat, papan, sektor IDX-IC', 'Harian 06.00', 1],
  ['px', 'Harga penutupan', 'Dipakai untuk nilai portofolio, bukan real time', 'Hari bursa 17.30', 2],
  ['sub', 'Anak usaha', 'Daftar dan persentase kepemilikan', 'Harian 06.00', 3],
  ['mgmt', 'Manajemen', 'Direksi dan komisaris', 'Harian 06.00', 4],
  ['idx', 'Category index', 'Klasifikasi IDX-IC dan indeks', 'Mingguan, Senin 06.00', 5],
  ['kip', 'Keterbukaan informasi', 'Pengumuman emiten untuk “Perubahan bisnis”', 'Tiap 30 menit, jam bursa', 6],
  ['lk', 'Laporan keuangan (XBRL)', 'Laporan kuartalan dan tahunan', 'Harian 07.00', 7],
  ['ipo', 'Pencatatan & IPO', 'Emiten baru dan jadwal penawaran umum', 'Harian 06.00', 8],
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements });
    await queryInterface.addColumn('sync_jobs', 'position', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });

    await q('UPDATE sync_failures SET "jobKey" = \'prof\' WHERE "jobKey" IN (:removed)', { removed: REMOVED });
    await q('UPDATE sync_conflicts SET "jobKey" = \'prof\' WHERE "jobKey" IN (:removed)', { removed: REMOVED });
    await q('DELETE FROM sync_jobs WHERE key IN (:removed)', { removed: REMOVED });

    for (const [i, [key, name, description, schedule]] of LIST.entries()) {
      const r = { key, name, description, schedule, position: i + 1 };
      // Baris yang sudah ada: nama, deskripsi, urutan. Jadwal dan hasil run terakhir tidak disentuh.
      await q('UPDATE sync_jobs SET name = :name, description = :description, position = :position, "updatedAt" = now() WHERE key = :key', r);
      await q(
        `INSERT INTO sync_jobs (key, name, description, schedule, position, "createdAt", "updatedAt")
         SELECT :key, :name, :description, :schedule, :position, now(), now() WHERE NOT EXISTS (SELECT 1 FROM sync_jobs WHERE key = :key)`, r,
      );
    }
  },

  // Best effort: kegagalan/kartu yang sudah dipindah ke `prof` tidak dipisah lagi.
  async down(queryInterface) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements });
    await q('DELETE FROM sync_jobs WHERE key IN (\'logo\', \'special\')');
    for (const [key, name, description, schedule, position] of OLD) {
      const r = { key, name, description, schedule, position };
      await q('UPDATE sync_jobs SET name = :name, description = :description, "updatedAt" = now() WHERE key = :key', r);
      await q(
        `INSERT INTO sync_jobs (key, name, description, schedule, "createdAt", "updatedAt")
         SELECT :key, :name, :description, :schedule, now(), now() WHERE NOT EXISTS (SELECT 1 FROM sync_jobs WHERE key = :key)`, r,
      );
    }
    await queryInterface.removeColumn('sync_jobs', 'position');
  },
};
