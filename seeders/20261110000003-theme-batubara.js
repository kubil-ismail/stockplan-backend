'use strict';

const { randomUUID } = require('crypto');
// Copied from stockplan-app-handoff/fixtures/theme-batubara.json (5 stages, 21 companies).
const fixture = require('./data/theme-batubara.json');

// Companies the fixture adds beyond companies-search.json. Classification is dev-only:
// contractors → jasa, miners → batu bara, shipping → transportasi.
const EXTRA = {
  DOID: ['energi', 'jasa-peralatan-migas-batu-bara'],
  PTRO: ['energi', 'jasa-peralatan-migas-batu-bara'],
  ABMM: ['energi', 'jasa-peralatan-migas-batu-bara'],
  BYAN: ['energi', 'batu-bara'],
  GEMS: ['energi', 'batu-bara'],
  HRUM: ['energi', 'batu-bara'],
  BSSR: ['energi', 'batu-bara'],
  DSSA: ['energi', 'batu-bara'],
  TOBA: ['energi', 'batu-bara'],
  MBAP: ['energi', 'batu-bara'],
  KKGI: ['energi', 'batu-bara'],
  ADMR: ['energi', 'batu-bara'],
  TCPI: ['transportasi-logistik', null],
  PSSI: ['transportasi-logistik', null],
};

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql).then(([rows]) => rows);
    const sectorId = Object.fromEntries((await q('SELECT id, slug FROM theme_sectors')).map((r) => [r.slug, r.id]));
    const industryId = Object.fromEntries((await q('SELECT id, slug FROM theme_industries')).map((r) => [r.slug, r.id]));
    const now = new Date();
    const ts = { createdAt: now, updatedAt: now };

    const extra = fixture.companies.filter((c) => EXTRA[c.ticker]).map((c) => ({
      ticker: c.ticker,
      name: c.name,
      summary: c.summary,
      sectorId: sectorId[EXTRA[c.ticker][0]] || null,
      industryId: industryId[EXTRA[c.ticker][1]] || null,
      logoUrl: c.ticker === 'ADMR' ? '/logos/emiten/logo-admr.svg' : null,
      status: 'listed',
      profile: '{}',
      ...ts,
    }));
    await queryInterface.bulkInsert('market_companies', extra, { ignoreDuplicates: true });

    const themeId = randomUUID();
    await queryInterface.bulkInsert('theme_themes', [{
      id: themeId, slug: fixture.slug, name: fixture.name, sectorId: sectorId.energi || null,
      description: fixture.description, status: 'published', ...ts,
    }]);
    await queryInterface.bulkInsert('theme_stages', fixture.stages.map((s) => ({
      id: randomUUID(), themeId, order: s.n, groupKey: s.g.toLowerCase(), name: s.name, shortName: s.short,
      description: s.desc, tickers: JSON.stringify(s.tks), ...ts,
    })));
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('theme_themes', { slug: fixture.slug }); // cascades to stages
    await queryInterface.bulkDelete('market_companies', { ticker: Object.keys(EXTRA) });
  },
};
