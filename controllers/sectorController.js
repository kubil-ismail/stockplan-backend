'use strict';

const { Op } = require('sequelize');
const { Sector, Subsector, Company, Industry, ThemeStage } = require('../models');
const sectors = require('../lib/sectors');
const { withSector, clientVisible } = require('../lib/themes');
const { fail } = require('../lib/http');

// shortcut: loads every company's light fields to count per sector/industry; fine for ~1k BEI listings.
// IPO-stage companies aren't listed yet, so they don't count as "[n] emiten".
const companyStats = () => Company.findAll({
  where: { status: { [Op.ne]: 'ipo' }, publishedAt: { [Op.ne]: null } },
  attributes: ['ticker', 'logoUrl', 'marketCap', 'sectorId', 'industryId'],
  raw: true,
});

// Industries with a published value chain ("Tema" cards on the sector map and sector page), alphabetical.
const publishedThemes = async () => (await Industry.findAll({
  where: clientVisible({ publishedAt: { [Op.ne]: null } }),
  attributes: ['slug', 'name', 'description'],
  include: [{ model: Subsector, as: 'subsector', attributes: ['sectorId'] }, { model: ThemeStage, as: 'stages', attributes: ['tickers'] }],
  order: [['name', 'ASC']],
})).map((t) => sectors.themeCard(withSector(t.get({ plain: true }))));

const withTree = {
  include: [{ model: Subsector, as: 'subsectors' }],
  order: [['position', 'ASC'], [{ model: Subsector, as: 'subsectors' }, 'position', 'ASC']],
};

// Sector page rows ("industri"): industries published to the sector page (listedAt), with or without a value chain.
const mapRows = async () => (await Industry.findAll({
  where: clientVisible({ listedAt: { [Op.ne]: null } }),
  attributes: ['id', 'subsectorId', 'slug', 'name', 'icon', 'position', 'dataStatus', 'dataUpdatedAt', 'updateNote', 'publishedAt'],
  include: [{ model: ThemeStage, as: 'stages', attributes: ['tickers'] }],
})).map((t) => t.get({ plain: true }));

// GET /sectors — sector map (design: Tema). Industry names are included for the page's search box.
exports.index = async (req, res, next) => {
  try {
    const now = Date.now();
    const [rows, list, themes, map] = await Promise.all([Sector.findAll(withTree), companyStats(), publishedThemes(), mapRows()]);
    res.json({
      sectors: rows.map((row) => {
        const { subsectors, ...v } = sectors.sectorView(sectors.withRows(row.get({ plain: true }), map), now, list, themes);
        return { ...v, industryNames: subsectors.flatMap((s) => s.industries.map((i) => i.name)) };
      }),
    });
  } catch (err) {
    next(err);
  }
};

// GET /sectors/:slug — subsectors and industries (design: TemaSektor).
exports.show = async (req, res, next) => {
  try {
    const [row, list, themes, map] = await Promise.all([Sector.findOne({ where: { slug: req.params.slug }, ...withTree }), companyStats(), publishedThemes(), mapRows()]);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Sektor tidak ditemukan.'); // COPY: perlu review
    const now = Date.now();
    const tree = sectors.withRows(row.get({ plain: true }), map);
    res.json({ sector: sectors.sectorView(tree, now, list, themes), notice: sectors.sectorNotice(tree, now) });
  } catch (err) {
    next(err);
  }
};
