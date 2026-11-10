'use strict';

const { randomUUID } = require('crypto');

// Dev data from design/screens/Tema.dc.html (11 sectors) and TemaSektor.dc.html (Energi hierarchy).
// Other sectors have no industries yet → they show "Segera hadir" until admin fills them.
const SECTORS = [
  ['energi', 'Energi', 'bolt'],
  ['barang-baku', 'Barang Baku', 'cube'],
  ['perindustrian', 'Perindustrian', 'factory'],
  ['barang-konsumen-primer', 'Barang Konsumen Primer', 'basket'],
  ['barang-konsumen-non-primer', 'Barang Konsumen Non-Primer', 'bag'],
  ['kesehatan', 'Kesehatan', 'plus'],
  ['keuangan', 'Keuangan', 'bank'],
  ['properti-real-estat', 'Properti & Real Estat', 'building'],
  ['teknologi', 'Teknologi', 'chip'],
  ['infrastruktur', 'Infrastruktur', 'tower'],
  ['transportasi-logistik', 'Transportasi & Logistik', 'truck'],
];

const DAY = 24 * 60 * 60 * 1000;

const ENERGI = [
  ['Minyak, Gas & Batu Bara', [
    // Dated relative to seeding so the "Baru" state and banner are visible in dev.
    { slug: 'batu-bara', name: 'Batu Bara', icon: 'flame', dataStatus: 'ready', dataUpdatedAt: new Date(Date.now() - DAY), updateNote: 'diperbarui dari laporan keuangan Q3 2026', themeSlug: 'batubara' },
    { slug: 'minyak-gas', name: 'Minyak & Gas', icon: 'droplet' },
    { slug: 'jasa-peralatan-migas-batu-bara', name: 'Jasa & Peralatan Migas dan Batu Bara', icon: 'wrench', dataStatus: 'ready', dataUpdatedAt: new Date(Date.now() - 30 * DAY) },
  ]],
  ['Energi Alternatif', [
    { slug: 'peralatan-energi-alternatif', name: 'Peralatan Energi Alternatif', icon: 'sun' },
    { slug: 'bahan-bakar-alternatif', name: 'Bahan Bakar Alternatif', icon: 'leaf' },
  ]],
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const ts = { createdAt: now, updatedAt: now };
    const sectors = SECTORS.map(([slug, name, icon], position) => ({ id: randomUUID(), slug, name, icon, position, ...ts }));
    await queryInterface.bulkInsert('theme_sectors', sectors);

    const energiId = sectors.find((s) => s.slug === 'energi').id;
    const subsectors = [];
    const industries = [];
    ENERGI.forEach(([name, items], position) => {
      const id = randomUUID();
      subsectors.push({ id, sectorId: energiId, name, position, ...ts });
      items.forEach((it, i) => industries.push({
        id: randomUUID(), subsectorId: id, position: i, icon: null, dataStatus: 'soon',
        dataUpdatedAt: null, updateNote: null, themeSlug: null, ...it, ...ts,
      }));
    });
    await queryInterface.bulkInsert('theme_subsectors', subsectors);
    await queryInterface.bulkInsert('theme_industries', industries);
  },

  async down(queryInterface) {
    // Cascades to subsectors and industries.
    await queryInterface.bulkDelete('theme_sectors', { slug: SECTORS.map(([slug]) => slug) });
  },
};
