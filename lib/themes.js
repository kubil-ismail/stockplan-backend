'use strict';

const { Op } = require('sequelize');
const { num } = require('./companies');

const GROUPS = ['hulu', 'tengah', 'hilir'];
// Same defaults the admin form uses when a theme has no custom main groups.
const DEFAULT_GROUPS = [
  { key: 'hulu', title: 'Hulu', description: '', icon: 'mine', color: 'amber' },
  { key: 'tengah', title: 'Tengah', description: '', icon: 'truck', color: 'blue' },
  { key: 'hilir', title: 'Hilir', description: '', icon: 'bolt', color: 'green' },
];

// Tickers in order of first appearance across stages (stage 1 first) — the table/drawer order in TemaDetail.
function companyOrder(stages) {
  return [...new Set([...stages].sort((a, b) => a.order - b.order).flatMap((s) => s.tickers || []))];
}

const company = (c) => ({
  ticker: c.ticker,
  name: c.name,
  summary: c.summary || null,
  logoUrl: c.logoUrl || null,
  status: c.status,
  tagline: c.tagline || null, // "Pembeda utama"
  marketCap: num(c.marketCap),
  priceDate: c.priceDate || null,
  highlights: (c.profile && c.profile.highlights) || null, // { stats, insight, revenueMix, subsidiaries } for the drawer
});

// GET /themes/:slug body. Stage tickers without a company row are dropped so clients can index companies safely.
function themeView(theme, stages, companies, watchTickers = []) {
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));
  const known = (tks) => (tks || []).filter((t) => byTicker.has(t));
  const order = companyOrder(stages).filter((t) => byTicker.has(t));
  const priced = order.map((t) => byTicker.get(t)).filter((c) => c.marketCap !== null && c.marketCap !== undefined && c.priceDate);
  const mcapAsOf = priced.map((c) => c.priceDate).sort().at(-1) || null;
  const inTheme = new Set(order);
  return {
    theme: {
      slug: theme.slug,
      name: theme.name,
      description: theme.description || null,
      icon: theme.icon || null,
      sector: theme.sector ? { slug: theme.sector.slug, name: theme.sector.name } : null,
      drivers: theme.drivers || [],
    },
    // "Tahap utama": title, icon, color per group key used by stages[].group.
    groups: theme.groups || DEFAULT_GROUPS.filter((g) => stages.some((s) => s.groupKey === g.key)),
    stages: [...stages].sort((a, b) => a.order - b.order).map((s) => ({
      order: s.order,
      group: s.groupKey,
      name: s.name,
      shortName: s.shortName || null,
      description: s.description || null,
      tickers: known(s.tickers),
      shares: Object.fromEntries(known(s.tickers).map((t) => [t, ((s.shares || {})[t] || {}).pct ?? null])), // revenue % from this stage
    })),
    companies: order.map((t) => company(byTicker.get(t))),
    mcapAsOf,
    viewer: { watchlist: watchTickers.filter((t) => inTheme.has(t)) },
  };
}

// For search results: ticker → published themes it appears in ("Tema terkait"). stages carry .theme.
function themesByTicker(stages, tickers) {
  const out = Object.fromEntries(tickers.map((t) => [t, []]));
  for (const s of [...stages].sort((a, b) => a.order - b.order)) {
    for (const t of s.tickers || []) {
      if (!out[t] || out[t].some((x) => x.slug === s.theme.slug)) continue;
      out[t].push({ slug: s.theme.slug, name: s.theme.name });
    }
  }
  return out;
}

// Industries have no sectorId of their own: expose the subsector's sector as .sector / .sectorId, the shape
// theme code reads. row must include subsector (with sectorId, and sector for .sector). Works on instances and plain rows.
function withSector(row) {
  if (!row) return row;
  const sub = row.subsector;
  row.sector = (sub && sub.sector) || null;
  row.sectorId = sub ? sub.sectorId : null;
  return row;
}

// Client-facing where-clause for industries: status 'draft' (admin is editing, not yet re-published) is hidden
// from customers until it is published again. 'review' stays visible.
const clientVisible = (where = {}) => ({ ...where, status: { [Op.ne]: 'draft' } });

// ThemeStage where-clause: stage holds any of these tickers (JSONB @> per ticker, served by the GIN index).
const stagesWithAny = (tickers) => ({ [Op.or]: tickers.map((t) => ({ tickers: { [Op.contains]: [t] } })) });

module.exports = { GROUPS, DEFAULT_GROUPS, companyOrder, themeView, themesByTicker, withSector, clientVisible, stagesWithAny };
