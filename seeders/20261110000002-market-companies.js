'use strict';

// Dev data: 35 companies from design/screens/EmitenSearch.dc.html (seeders/data/companies-search.json),
// full detail for BUMI and ABNU, peer market caps/captions from Emiten.dc.html.
const search = require('./data/companies-search.json');
const detail = require('./data/companies-detail');

const T = 1e12;

const SECTOR_SLUG = {
  Energi: 'energi', Keuangan: 'keuangan', 'Barang konsumsi': 'barang-konsumen-primer', 'Barang baku': 'barang-baku',
  Infrastruktur: 'infrastruktur', Teknologi: 'teknologi', Kesehatan: 'kesehatan', Properti: 'properti-real-estat', Perindustrian: 'perindustrian',
};

// Only Energi has industries seeded (see 20261110000001-theme-sectors.js).
const INDUSTRY_SLUG = {
  BUMI: 'batu-bara', PTBA: 'batu-bara', AADI: 'batu-bara', ITMG: 'batu-bara', INDY: 'batu-bara', CUAN: 'batu-bara',
  UNTR: 'jasa-peralatan-migas-batu-bara', DEWA: 'jasa-peralatan-migas-batu-bara',
  PGAS: 'minyak-gas', MEDC: 'minyak-gas',
};

const LOGO = { BUMI: 'logo-bumi.png', PTBA: 'logo-ptba.svg', AADI: 'logo-aadi.svg', ITMG: 'logo-itmg.svg', INDY: 'logo-indy.svg', UNTR: 'logo-untr.svg' };

// "Satu tahap dengan BUMI" card in the design.
const PEER = {
  AADI: { marketCap: 95.2 * T, tagline: 'Spin-off ADRO (2024)' },
  PTBA: { marketCap: 32.2 * T, tagline: 'BUMN · >50% ke PLN' },
  INDY: { marketCap: 14.5 * T, tagline: 'Diversifikasi ke EV' },
  ITMG: { marketCap: 25.4 * T, tagline: 'Kalori tinggi · ~75% ekspor' },
};

module.exports = {
  async up(queryInterface) {
    const [sectors] = await queryInterface.sequelize.query('SELECT id, slug FROM theme_sectors');
    const [industries] = await queryInterface.sequelize.query('SELECT id, slug FROM theme_industries');
    const sectorId = Object.fromEntries(sectors.map((s) => [s.slug, s.id]));
    const industryId = Object.fromEntries(industries.map((i) => [i.slug, i.id]));
    const now = new Date();

    const base = [...search, { ticker: 'ABNU', ...detail.ABNU }];
    const rows = base.map((c) => {
      const d = detail[c.ticker] || {};
      const profile = d.profile || {};
      return {
        ticker: c.ticker,
        name: d.name || c.name,
        sectorId: sectorId[SECTOR_SLUG[d.sector || c.sector]] || null,
        industryId: industryId[INDUSTRY_SLUG[c.ticker]] || null,
        logoUrl: LOGO[c.ticker] ? `/logos/emiten/${LOGO[c.ticker]}` : null,
        status: d.status || 'listed',
        listingBoard: d.listingBoard || null,
        listedYear: d.listedYear || null,
        groupName: d.groupName || null,
        sizeClass: c.sizeClass || null,
        tagline: (PEER[c.ticker] && PEER[c.ticker].tagline) || null,
        summary: d.summary || c.summary,
        marketCap: d.marketCap || (PEER[c.ticker] && PEER[c.ticker].marketCap) || null,
        metrics: d.metrics ? JSON.stringify(d.metrics) : null,
        financialPeriod: d.financialPeriod || null,
        priceDate: d.priceDate || null,
        dataDelayed: null,
        profile: JSON.stringify(profile),
        ipo: d.ipo ? JSON.stringify(d.ipo) : null,
        createdAt: now,
        updatedAt: now,
      };
    });
    await queryInterface.bulkInsert('market_companies', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('market_companies', { ticker: [...search.map((c) => c.ticker), 'ABNU'] });
  },
};
