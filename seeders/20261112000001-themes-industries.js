'use strict';

const { randomUUID } = require('crypto');

// Dev data for the Tema pages beyond Energi (TemaSektor + TemaDetail): sub-sectors and industries for Barang Baku,
// Keuangan, Infrastruktur and Teknologi, with a mix of "Segera hadir" / "Siap" / "Baru", and value chains for
// Nikel and Telekomunikasi. An industry IS a theme (theme_industries); only those with stages have a /tema/:slug page.
//
// Names of sub-sectors/industries and the company → industry classification are dev guesses, not official IDX-IC
// (same caveat as the Energi seed). Stage shares and sources are illustrative, not from financial statements.
//
// Safe to run on a DB that already has data: industries whose slug exists are skipped, subsectors are reused by name,
// and a company's industryId is only filled when empty. Run on its own:
//   npx sequelize-cli db:seed --seed 20261112000001-themes-industries.js
const DAY = 24 * 60 * 60 * 1000;
const SOURCE = 'Ilustrasi dev, bukan data laporan keuangan'; // COPY: perlu review

const TREE = [
  ['barang-baku', 'Logam & Mineral', [
    {
      slug: 'nikel', name: 'Nikel', icon: 'cube', dataStatus: 'ready', ago: 12, tickers: ['INCO', 'ANTM'],
      note: null,
      chain: {
        description: 'Dari menambang bijih sampai memurnikannya jadi produk nikel.', // COPY: perlu review
        drivers: ['Harga nikel dunia', 'Permintaan baterai kendaraan listrik'], // COPY: perlu review
        groups: [
          { key: 'hulu', title: 'Hulu', description: 'Menggali bijih nikel dari tambang.', icon: 'mine', color: 'amber' },
          { key: 'tengah', title: 'Tengah', description: 'Memurnikan bijih jadi nikel olahan.', icon: 'factory', color: 'blue' },
        ],
        stages: [
          { name: 'Penambangan bijih', short: 'Tambang', g: 'hulu', desc: 'Menggali bijih nikel dari tambang sendiri.', rows: [['INCO', 20], ['ANTM', 35]] },
          { name: 'Pemurnian & peleburan', short: 'Pemurnian', g: 'tengah', desc: 'Mengolah bijih jadi nikel matte atau feronikel.', rows: [['INCO', 80], ['ANTM', 15]] },
        ],
      },
    },
    { slug: 'emas-logam-mulia', name: 'Emas & Logam Mulia', icon: 'cube', dataStatus: 'soon' },
  ]],
  ['keuangan', 'Bank', [
    { slug: 'bank', name: 'Bank', icon: 'bank', dataStatus: 'ready', ago: 40, tickers: ['BBRI', 'BBNI', 'BBCA', 'BMRI'] },
    { slug: 'jasa-pembiayaan', name: 'Jasa Pembiayaan', icon: 'bag', dataStatus: 'soon' },
  ]],
  ['infrastruktur', 'Telekomunikasi', [
    {
      slug: 'telekomunikasi', name: 'Telekomunikasi', icon: 'tower', dataStatus: 'ready', ago: 2, tickers: ['TLKM', 'TOWR'],
      note: 'ditambah peta rantai nilai menara dan operator', // COPY: perlu review — banner "Data baru: industri X …"
      chain: {
        description: 'Dari menara dan jaringan sampai layanan ke pelanggan.', // COPY: perlu review
        drivers: ['Jumlah pelanggan dan trafik data', 'Belanja modal jaringan'], // COPY: perlu review
        groups: [
          { key: 'hulu', title: 'Infrastruktur', description: 'Membangun dan menyewakan menara.', icon: 'bolt', color: 'amber' },
          { key: 'hilir', title: 'Layanan', description: 'Menjual layanan seluler dan data.', icon: 'store', color: 'green' },
        ],
        stages: [
          { name: 'Menara & infrastruktur pasif', short: 'Menara', g: 'hulu', desc: 'Menyewakan menara ke operator seluler.', rows: [['TOWR', 100]] },
          { name: 'Operator & layanan pelanggan', short: 'Operator', g: 'hilir', desc: 'Menjual layanan seluler dan data ke pelanggan.', rows: [['TLKM', 70]] },
        ],
      },
    },
    { slug: 'jalan-tol', name: 'Jalan Tol', icon: 'truck', dataStatus: 'ready', ago: 45, tickers: ['JSMR'] },
  ]],
  ['teknologi', 'Perangkat Lunak & Jasa TI', [
    { slug: 'perangkat-lunak-jasa-ti', name: 'Perangkat Lunak & Jasa TI', icon: 'chip', dataStatus: 'soon' },
  ]],
];

module.exports = {
  async up(queryInterface) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, type: 'SELECT' });
    const sectorId = Object.fromEntries((await q('SELECT id, slug FROM theme_sectors')).map((r) => [r.slug, r.id]));
    const now = new Date();
    const ts = { createdAt: now, updatedAt: now };

    for (const [sector, subName, industries] of TREE) {
      if (!sectorId[sector]) continue;
      let [sub] = await q('SELECT id FROM theme_subsectors WHERE "sectorId" = ? AND name = ?', [sectorId[sector], subName]);
      if (!sub) {
        const [{ n }] = await q('SELECT count(*) AS n FROM theme_subsectors WHERE "sectorId" = ?', [sectorId[sector]]);
        sub = { id: randomUUID() };
        await queryInterface.bulkInsert('theme_subsectors', [{ id: sub.id, sectorId: sectorId[sector], name: subName, position: Number(n), ...ts }]);
      }

      for (const [position, it] of industries.entries()) {
        if ((await q('SELECT 1 FROM theme_industries WHERE slug = ?', [it.slug])).length) continue;
        const id = randomUUID();
        const ready = it.dataStatus === 'ready';
        await queryInterface.bulkInsert('theme_industries', [{
          id, subsectorId: sub.id, slug: it.slug, name: it.name, icon: it.icon, position,
          dataStatus: it.dataStatus, dataUpdatedAt: ready ? new Date(now - it.ago * DAY) : null, updateNote: it.note || null,
          status: 'published', listedAt: now, // on the sector page; publishedAt only for industries with a value chain
          description: it.chain ? it.chain.description : null,
          drivers: JSON.stringify(it.chain ? it.chain.drivers : []),
          groups: it.chain ? JSON.stringify(it.chain.groups) : null,
          publishedAt: it.chain ? now : null,
          ...ts,
        }]);
        if (it.chain) {
          await queryInterface.bulkInsert('theme_stages', it.chain.stages.map((s, i) => ({
            id: randomUUID(), industryId: id, order: i + 1, groupKey: s.g, name: s.name, shortName: s.short, description: s.desc,
            tickers: JSON.stringify(s.rows.map(([t]) => t)),
            shares: JSON.stringify(Object.fromEntries(s.rows.map(([t, pct]) => [t, { pct, source: SOURCE }]))),
            ...ts,
          })));
        }
        // IDX-IC classification: one industry per company (fills only where empty).
        if (it.tickers) {
          await queryInterface.sequelize.query('UPDATE market_companies SET "industryId" = ? WHERE ticker IN (?) AND "industryId" IS NULL', { replacements: [id, it.tickers] });
        }
      }
    }
  },

  async down(queryInterface) {
    const slugs = TREE.flatMap(([, , list]) => list.map((i) => i.slug));
    // Stages cascade; companies' industryId is SET NULL by the FK.
    await queryInterface.bulkDelete('theme_industries', { slug: slugs });
    await queryInterface.sequelize.query(
      `DELETE FROM theme_subsectors s WHERE s.name IN (:names) AND NOT EXISTS (SELECT 1 FROM theme_industries i WHERE i."subsectorId" = s.id)`,
      { replacements: { names: TREE.map(([, name]) => name) } },
    );
  },
};
