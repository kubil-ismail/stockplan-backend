'use strict';

module.exports = (sequelize, DataTypes) => {
  const Company = sequelize.define('Company', {
    ticker: { type: DataTypes.STRING(8), primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    sectorId: DataTypes.UUID,
    industryId: DataTypes.UUID,
    logoUrl: DataTypes.STRING, // no logo → client shows 2-letter avatar
    status: { type: DataTypes.ENUM('listed', 'ipo', 'suspended'), allowNull: false, defaultValue: 'listed' },
    listingBoard: DataTypes.STRING(40),
    listedYear: DataTypes.INTEGER,
    groupName: DataTypes.STRING,
    sizeClass: DataTypes.ENUM('small', 'medium', 'large'),
    tagline: DataTypes.STRING, // short caption in peer lists, e.g. "BUMN · >50% ke PLN"
    summary: DataTypes.TEXT, // one sentence for search results
    marketCap: DataTypes.BIGINT, // Rupiah, at priceDate close
    metrics: DataTypes.JSONB, // { pbv, roePct, grossMarginPct, debtToAssetPct }
    financialPeriod: DataTypes.STRING(20), // "H1-2026"
    priceDate: DataTypes.DATEONLY,
    dataDelayed: DataTypes.JSONB, // { lastUpdatedAt, nextCheckAt, handling } → "Data BEI tertunda" banner; null = up to date
    profile: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    ipo: DataTypes.JSONB,
    // Admin editorial workflow (docs/HANDOFF.md §5 Admin). DB defaults mark seeded rows published; no model defaults on purpose.
    publishStatus: DataTypes.STRING(20),
    publishedAt: DataTypes.DATE, // NULL = never published → hidden from customer endpoints
    draft: DataTypes.JSONB,
    updatedByName: DataTypes.STRING,
    teamSections: DataTypes.JSONB, // form sections edited by the team; BEI sync raises a conflict instead of overwriting
  }, { tableName: 'market_companies' });

  Company.associate = (models) => {
    Company.belongsTo(models.Sector, { as: 'sector', foreignKey: 'sectorId' });
    Company.belongsTo(models.Industry, { as: 'industry', foreignKey: 'industryId' });
  };

  return Company;
};
