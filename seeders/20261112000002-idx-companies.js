'use strict';

// All companies listed on IDX, from the crawler snapshot (seeders/data/idx-companies.json; rebuild with
// `node bin/build-idx-companies.js <crawler>/dist/idx/minify/company/detail`).
// Inserts only tickers not in the database yet, as DRAFTS (publishedAt NULL = hidden from the client) until the team
// completes and publishes them. Existing companies are never touched; later BEI changes go through AdminSinkron.
// Fields are mapped by the same code as the sync (lib/sync.fromCrawler) and stored like "Terbitkan" (formToColumns).
const { data } = require('./data/idx-companies.json');
const co = require('../lib/adminCompanies');
const sync = require('../lib/sync');

// Crawler (IDX-IC) slug -> theme_sectors slug where they differ.
const sectorSlug = (s) => ({ 'properti-dan-real-estat': 'properti-real-estat', 'transportasi-dan-logistik': 'transportasi-logistik' })[s] || s;
const companyName = (n) => (n && n.shortName ? `${n.shortName.trim()} Tbk` : String((n && n.longName) || '').replace(/^pt\.?\s+/i, '').trim());
const BATCH = 200;

module.exports = {
  async up(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql, { type: queryInterface.sequelize.QueryTypes.SELECT });
    const [existing, sectors, industries] = await Promise.all([
      q('SELECT ticker FROM market_companies'),
      q('SELECT id, slug FROM theme_sectors'),
      q('SELECT id, name FROM theme_industries'),
    ]);
    const have = new Set(existing.map((r) => r.ticker));
    const sectorId = Object.fromEntries(sectors.map((s) => [s.slug, s.id]));
    // Only links when one of our industries/themes has the same name (e.g. "Batu Bara"); otherwise left empty.
    const industryId = Object.fromEntries(industries.map((i) => [i.name.toLowerCase(), i.id]));
    const now = new Date();

    const rows = [];
    const skipped = [];
    for (const d of data) {
      if (have.has(d.ticker)) continue;
      const { sections, columns, errors } = sync.fromCrawler(d);
      if (errors) { skipped.push(`${d.ticker} (${Object.keys(errors).join(', ')})`); continue; }
      const slug = sectorSlug(d.sector && d.sector.slug && d.sector.slug.id);
      const form = co.emptyForm(false);
      Object.assign(form, {
        name: companyName(d.name),
        sectorSlug: sectorId[slug] ? slug : '',
        subsector: (d.sector && d.sector.sub_sector && d.sector.sub_sector.name && d.sector.sub_sector.name.id) || '',
      });
      for (const [k, v] of Object.entries(sections)) form[k] = sync.withBei(form, k, v);
      const attrs = co.formToColumns(form, { status: 'listed', profile: {} });
      const industry = d.industry && d.industry.name && d.industry.name.id;
      rows.push({
        ...attrs,
        ticker: d.ticker,
        sectorId: sectorId[slug] || null,
        industryId: (industry && industryId[industry.toLowerCase()]) || null,
        listingBoard: columns.listingBoard || null,
        listedYear: columns.listedYear || null,
        metrics: JSON.stringify(attrs.metrics),
        profile: JSON.stringify(attrs.profile),
        teamSections: '[]',
        publishStatus: 'draft',
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (let i = 0; i < rows.length; i += BATCH) await queryInterface.bulkInsert('market_companies', rows.slice(i, i + BATCH));
    console.log(`idx-companies: ${rows.length} emiten baru (draf), ${data.length - rows.length - skipped.length} sudah ada`);
    if (skipped.length) console.log(`idx-companies: dilewati karena data tidak valid: ${skipped.join('; ')}`);
  },

  // Removes only snapshot companies that are still unpublished drafts; anything the team published stays.
  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'DELETE FROM market_companies WHERE ticker IN (:tickers) AND "publishedAt" IS NULL AND "publishStatus" = \'draft\'',
      { replacements: { tickers: data.map((d) => d.ticker) } },
    );
  },
};
