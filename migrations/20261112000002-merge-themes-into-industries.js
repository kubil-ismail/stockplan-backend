'use strict';

const { randomUUID } = require('crypto');

// theme_themes is merged into theme_industries: an industry is the sector page row and, once published, its
// value chain (/themes/:slug). theme_stages point at industries. Every theme must end up in a subsector.
//   listedAt    = shown on the sector page (set on first publish; draft-only industries stay hidden)
//   publishedAt = value chain visible to customers (unchanged meaning)
const NEW_COLS = ['description', 'status', 'drivers', 'groups', 'draft', 'publishedAt', 'listedAt', 'updatedByName'];

module.exports = {
  async up(queryInterface, Sequelize) {
    const q = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements, type: 'SELECT' });
    const run = (sql, replacements) => queryInterface.sequelize.query(sql, { replacements });
    const t = 'theme_industries';

    await queryInterface.addColumn(t, 'description', { type: Sequelize.TEXT, allowNull: true });
    await queryInterface.addColumn(t, 'status', { type: Sequelize.ENUM('draft', 'review', 'published'), allowNull: false, defaultValue: 'draft' });
    await queryInterface.addColumn(t, 'drivers', { type: Sequelize.JSONB, allowNull: false, defaultValue: [] });
    await queryInterface.addColumn(t, 'groups', { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn(t, 'draft', { type: Sequelize.JSONB, allowNull: true });
    await queryInterface.addColumn(t, 'publishedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn(t, 'listedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn(t, 'updatedByName', { type: Sequelize.STRING, allowNull: true });
    // Existing industries were all on the sector page.
    await run(`UPDATE theme_industries SET "listedAt" = NOW(), status = 'published'`);

    await queryInterface.addColumn('theme_stages', 'industryId', { type: Sequelize.UUID, allowNull: true, references: { model: t, key: 'id' }, onDelete: 'CASCADE' });

    const themes = await q('SELECT * FROM theme_themes ORDER BY "createdAt"');
    for (const th of themes) {
      let [ind] = th.industryId ? await q('SELECT * FROM theme_industries WHERE id = ?', [th.industryId]) : [];
      if (!ind) {
        const [sub] = th.subsectorId
          ? [{ id: th.subsectorId }]
          : await q('SELECT id FROM theme_subsectors WHERE "sectorId" = ? ORDER BY position LIMIT 1', [th.sectorId]);
        if (!sub) throw new Error(`Tema "${th.slug}" tidak punya sub-sektor dan sektornya belum punya sub-sektor. Tambahkan sub-sektor atau hapus tema itu dulu.`);
        const [{ max }] = await q('SELECT MAX(position) AS max FROM theme_industries WHERE "subsectorId" = ?', [sub.id]);
        const id = randomUUID();
        await queryInterface.bulkInsert(t, [{
          id, subsectorId: sub.id, slug: `tmp-${id}`, name: th.name, position: th.subsectorId ? th.position : (max ?? -1) + 1,
          dataStatus: 'soon', drivers: '[]', createdAt: th.createdAt, updatedAt: th.updatedAt,
        }]);
        [ind] = await q('SELECT * FROM theme_industries WHERE id = ?', [id]);
      }
      // The theme slug is the public URL (/tema/:slug) and the audit target (theme:<slug>), so it wins.
      const clash = await q('SELECT slug FROM theme_industries WHERE slug = ? AND id <> ?', [th.slug, ind.id]);
      if (clash.length) throw new Error(`Slug "${th.slug}" sudah dipakai industri lain; ganti salah satunya dulu.`);
      const onMap = !!(th.subsectorId || th.publishedAt);
      await queryInterface.bulkUpdate(t, {
        slug: th.slug, name: th.name, description: th.description, status: th.status,
        drivers: JSON.stringify(th.drivers || []), groups: th.groups ? JSON.stringify(th.groups) : null,
        draft: th.draft ? JSON.stringify(th.draft) : null, publishedAt: th.publishedAt, updatedByName: th.updatedByName,
        icon: th.icon || ind.icon,
        // Sector map values set through the admin form win over the industry's own.
        ...(th.subsectorId && { subsectorId: th.subsectorId, dataStatus: th.dataStatus, dataUpdatedAt: th.dataUpdatedAt, updateNote: th.updateNote }),
        listedAt: ind.listedAt || (onMap ? new Date() : null),
        updatedAt: th.updatedAt,
      }, { id: ind.id });
      await run('UPDATE theme_stages SET "industryId" = ? WHERE "themeId" = ?', [ind.id, th.id]);
    }

    await queryInterface.removeColumn('theme_stages', 'themeId'); // drops its FK and the (themeId, order) index
    await run('ALTER TABLE theme_stages ALTER COLUMN "industryId" SET NOT NULL');
    await queryInterface.addIndex('theme_stages', ['industryId', 'order'], { unique: true });
    await queryInterface.dropTable('theme_themes');
    await run('DROP TYPE IF EXISTS "enum_theme_themes_status";');
    await run('DROP TYPE IF EXISTS "enum_theme_themes_dataStatus";');
  },

  // Recreates theme_themes (shape after 20261112000001) with one theme per industry that has chain data
  // (stages, a draft or a published chain), same id, so stages can point back. Industries the up step created
  // from themes stay as industries.
  async down(queryInterface, Sequelize) {
    const run = (sql) => queryInterface.sequelize.query(sql);
    const ts = { createdAt: { type: Sequelize.DATE, allowNull: false }, updatedAt: { type: Sequelize.DATE, allowNull: false } };
    await queryInterface.createTable('theme_themes', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      name: { type: Sequelize.STRING, allowNull: false },
      sectorId: { type: Sequelize.UUID, references: { model: 'theme_sectors', key: 'id' }, onDelete: 'SET NULL' },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('draft', 'review', 'published'), allowNull: false, defaultValue: 'draft' },
      drivers: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      groups: { type: Sequelize.JSONB },
      draft: { type: Sequelize.JSONB },
      publishedAt: { type: Sequelize.DATE, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
      updatedByName: { type: Sequelize.STRING },
      subsectorId: { type: Sequelize.UUID, references: { model: 'theme_subsectors', key: 'id' }, onDelete: 'SET NULL' },
      industryId: { type: Sequelize.UUID, references: { model: 'theme_industries', key: 'id' }, onDelete: 'SET NULL' },
      icon: { type: Sequelize.STRING(40) },
      position: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      dataStatus: { type: Sequelize.ENUM('soon', 'ready'), allowNull: false, defaultValue: 'soon' },
      dataUpdatedAt: { type: Sequelize.DATE },
      updateNote: { type: Sequelize.STRING },
      ...ts,
    });
    await queryInterface.addIndex('theme_themes', ['subsectorId']);
    await run(`INSERT INTO theme_themes (id, slug, name, "sectorId", description, status, drivers, groups, draft, "publishedAt", "updatedByName",
        "subsectorId", "industryId", icon, position, "dataStatus", "dataUpdatedAt", "updateNote", "createdAt", "updatedAt")
      SELECT i.id, i.slug, i.name, s."sectorId", i.description, i.status::text::"enum_theme_themes_status", i.drivers, i.groups, i.draft, i."publishedAt", i."updatedByName",
        CASE WHEN i."listedAt" IS NOT NULL THEN i."subsectorId" END, i.id, i.icon, i.position, i."dataStatus"::text::"enum_theme_themes_dataStatus", i."dataUpdatedAt", i."updateNote", i."createdAt", i."updatedAt"
      FROM theme_industries i JOIN theme_subsectors s ON s.id = i."subsectorId"
      WHERE i."publishedAt" IS NOT NULL OR i.draft IS NOT NULL OR EXISTS (SELECT 1 FROM theme_stages st WHERE st."industryId" = i.id)`);
    await queryInterface.addColumn('theme_stages', 'themeId', { type: Sequelize.UUID, allowNull: true, references: { model: 'theme_themes', key: 'id' }, onDelete: 'CASCADE' });
    await run('UPDATE theme_stages SET "themeId" = "industryId"');
    await queryInterface.removeColumn('theme_stages', 'industryId');
    await run('ALTER TABLE theme_stages ALTER COLUMN "themeId" SET NOT NULL');
    await queryInterface.addIndex('theme_stages', ['themeId', 'order'], { unique: true });
    for (const c of [...NEW_COLS].reverse()) await queryInterface.removeColumn('theme_industries', c);
    await run('DROP TYPE IF EXISTS "enum_theme_industries_status";');
  },
};
