'use strict';

const { randomUUID } = require('crypto');

// Rows on the sector page ("industri" in TemaSektor) now come from theme_themes instead of theme_industries.
// Columns hold the published values (admin edits go through draft → publish). theme_industries stays as the
// companies' IDX-IC classification and is not touched here.
const COLS = ['subsectorId', 'industryId', 'icon', 'position', 'dataStatus', 'dataUpdatedAt', 'updateNote'];

// Copies every theme_industries row onto a theme: merged into the theme named by industry.themeSlug, otherwise a new
// sector-map-only theme (no stages, publishedAt NULL). Idempotent, so the seeder can call it on a fresh DB.
async function backfill(queryInterface) {
  const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, type: 'SELECT' });
  const inds = await q(`SELECT i.*, s."sectorId" FROM theme_industries i JOIN theme_subsectors s ON s.id = i."subsectorId" ORDER BY i.position`);
  const now = new Date();
  for (const i of inds) {
    if ((await q('SELECT 1 FROM theme_themes WHERE "industryId" = ?', [i.id])).length) continue; // already done
    const map = {
      subsectorId: i.subsectorId, industryId: i.id, icon: i.icon, position: i.position,
      dataStatus: i.dataStatus, dataUpdatedAt: i.dataUpdatedAt, updateNote: i.updateNote,
    };
    const [target] = i.themeSlug ? await q('SELECT id FROM theme_themes WHERE slug = ?', [i.themeSlug]) : [];
    if (target) {
      await queryInterface.bulkUpdate('theme_themes', map, { id: target.id });
      continue;
    }
    if ((await q('SELECT 1 FROM theme_themes WHERE slug = ?', [i.slug])).length) {
      throw new Error(`theme_themes.slug "${i.slug}" sudah dipakai tema lain; ganti slug tema itu dulu.`);
    }
    await queryInterface.bulkInsert('theme_themes', [{
      id: randomUUID(), slug: i.slug, name: i.name, sectorId: i.sectorId, description: null,
      status: 'published', drivers: JSON.stringify([]), groups: null, draft: null,
      publishedAt: null, // explicit: the column's DB default would make it a visible (empty) value chain
      createdAt: now, updatedAt: now, ...map,
    }]);
  }
}

// Reverse of backfill: drops the sector-map-only themes it created and clears the columns elsewhere.
async function unbackfill(queryInterface) {
  await queryInterface.sequelize.query(`DELETE FROM theme_themes t WHERE "industryId" IS NOT NULL AND "publishedAt" IS NULL
    AND NOT EXISTS (SELECT 1 FROM theme_stages s WHERE s."themeId" = t.id)`);
  await queryInterface.sequelize.query(`UPDATE theme_themes SET "subsectorId" = NULL, "industryId" = NULL, icon = NULL, position = 0,
    "dataStatus" = 'soon', "dataUpdatedAt" = NULL, "updateNote" = NULL`);
}

module.exports = {
  backfill,
  unbackfill,

  async up(queryInterface, Sequelize) {
    const t = 'theme_themes';
    await queryInterface.addColumn(t, 'subsectorId', { type: Sequelize.UUID, allowNull: true, references: { model: 'theme_subsectors', key: 'id' }, onDelete: 'SET NULL' });
    // Reference to the IDX-IC industry the row was migrated from: source of "[n] emiten" and admin mapping suggestions.
    await queryInterface.addColumn(t, 'industryId', { type: Sequelize.UUID, allowNull: true, references: { model: 'theme_industries', key: 'id' }, onDelete: 'SET NULL' });
    await queryInterface.addColumn(t, 'icon', { type: Sequelize.STRING(40), allowNull: true });
    await queryInterface.addColumn(t, 'position', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn(t, 'dataStatus', { type: Sequelize.ENUM('soon', 'ready'), allowNull: false, defaultValue: 'soon' });
    await queryInterface.addColumn(t, 'dataUpdatedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn(t, 'updateNote', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addIndex(t, ['subsectorId']);
    await backfill(queryInterface);
  },

  async down(queryInterface) {
    await unbackfill(queryInterface);
    for (const c of [...COLS].reverse()) await queryInterface.removeColumn('theme_themes', c);
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_theme_themes_dataStatus";');
  },
};
