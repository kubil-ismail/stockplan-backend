'use strict';

const { Op } = require('sequelize');
const { Sector, Subsector, Industry, Company } = require('../models');
const sectors = require('../lib/sectors');
const { fail } = require('../lib/http');

// shortcut: loads every company's light fields to count per sector/industry; fine for ~1k BEI listings.
// IPO-stage companies aren't listed yet, so they don't count as "[n] emiten".
const companyStats = () => Company.findAll({
  where: { status: { [Op.ne]: 'ipo' }, publishedAt: { [Op.ne]: null } },
  attributes: ['ticker', 'logoUrl', 'marketCap', 'sectorId', 'industryId'],
  raw: true,
});

const withTree = {
  include: [{ model: Subsector, as: 'subsectors', include: [{ model: Industry, as: 'industries' }] }],
  order: [
    ['position', 'ASC'],
    [{ model: Subsector, as: 'subsectors' }, 'position', 'ASC'],
    [{ model: Subsector, as: 'subsectors' }, { model: Industry, as: 'industries' }, 'position', 'ASC'],
  ],
};

// GET /sectors — sector map (design: Tema). Industry names are included for the page's search box.
exports.index = async (req, res, next) => {
  try {
    const now = Date.now();
    const [rows, list] = await Promise.all([Sector.findAll(withTree), companyStats()]);
    res.json({
      sectors: rows.map((row) => {
        const { subsectors, ...v } = sectors.sectorView(row, now, list);
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
    const [row, list] = await Promise.all([Sector.findOne({ where: { slug: req.params.slug }, ...withTree }), companyStats()]);
    if (!row) return fail(res, 404, 'NOT_FOUND', 'Sektor tidak ditemukan.'); // COPY: perlu review
    const now = Date.now();
    res.json({ sector: sectors.sectorView(row, now, list), notice: sectors.sectorNotice(row, now) });
  } catch (err) {
    next(err);
  }
};
