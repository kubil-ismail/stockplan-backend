'use strict';

const DAY = 24 * 60 * 60 * 1000;
const NEW_WINDOW = 7 * DAY; // "Baru: Data diperbarui 7 hari terakhir"

// Display status: 'soon' (Segera hadir), 'new' (Baru), 'ok' (Siap). Follows dataStatus only (set by admin), not publishedAt.
function industryStatus(ind, now = Date.now()) {
  if (ind.dataStatus !== 'ready') return 'soon';
  const at = ind.dataUpdatedAt ? new Date(ind.dataUpdatedAt).getTime() : null;
  return at !== null && now - at <= NEW_WINDOW ? 'new' : 'ok';
}

// A sector is ready once any industry is; "Baru" if any industry is new.
function sectorStatus(statuses) {
  if (!statuses.some((s) => s !== 'soon')) return 'soon';
  return statuses.includes('new') ? 'new' : 'ok';
}

const latest = (dates) => dates.filter(Boolean).map((d) => new Date(d)).sort((a, b) => b - a)[0] || null;

const LEADERS = 3;

// companies: [{ ticker, logoUrl, marketCap, sectorId, industryId }], any order.
function emitenStats(list) {
  const sorted = [...list].sort((a, b) => (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0) || a.ticker.localeCompare(b.ticker));
  return { emitenCount: list.length, leaders: sorted.slice(0, LEADERS).map((c) => ({ ticker: c.ticker, logoUrl: c.logoUrl || null })) };
}

// "[n] emiten": companies classified in this industry plus those in its published value chain.
function rowCompanies(row, companies) {
  const tickers = new Set((row.stages || []).flatMap((s) => s.tickers || []));
  return companies.filter((c) => c.industryId === row.id || tickers.has(c.ticker));
}

// row = listed industry (+ stages[].tickers).
// fallbackIcon: the sector's icon, for rows published before an icon was required (clients index icons by key).
function industryView(row, now, companies = [], fallbackIcon = null) {
  return {
    slug: row.slug,
    name: row.name,
    icon: row.icon || fallbackIcon,
    status: industryStatus(row, now),
    updatedAt: row.dataStatus === 'ready' ? row.dataUpdatedAt : null,
    themeSlug: row.publishedAt ? row.slug : null, // "Lihat" only when the value chain is published
    ...emitenStats(rowCompanies(row, companies)),
  };
}

// sector (plain, with subsectors[]) + sector-page rows of any sector -> subsectors[].industries[] in display order.
function withRows(sector, rows) {
  const order = (a, b) => a.position - b.position || a.name.localeCompare(b.name);
  return {
    ...sector,
    subsectors: (sector.subsectors || []).map((sub) => ({ ...sub, industries: rows.filter((r) => r.subsectorId === sub.id).sort(order) })),
  };
}

// Industry with a published value chain (with stages) → card for the sector pages. t.sectorId via withSector().
const themeCard = (t) => ({
  sectorId: t.sectorId,
  slug: t.slug,
  name: t.name,
  description: t.description || null,
  stageCount: (t.stages || []).length,
  emitenCount: new Set((t.stages || []).flatMap((s) => s.tickers || [])).size,
});

// sector must include subsectors[].industries[] (see withRows); themes = themeCard()s of published themes (any sector).
function sectorView(sector, now = Date.now(), companies = [], themes = []) {
  const subsectors = (sector.subsectors || []).map((sub) => ({
    name: sub.name,
    industries: (sub.industries || []).map((i) => industryView(i, now, companies, sector.icon)),
  }));
  const industries = subsectors.flatMap((s) => s.industries);
  const own = themes.filter((t) => t.sectorId === sector.id).map(({ sectorId, ...t }) => t);
  return {
    slug: sector.slug,
    name: sector.name,
    icon: sector.icon,
    status: sectorStatus(industries.map((i) => i.status)), // all industries soon (or none) = Segera hadir
    updatedAt: latest(industries.map((i) => i.updatedAt)),
    subsectorCount: subsectors.length,
    industryCount: industries.length,
    ...emitenStats(companies.filter((c) => c.sectorId === sector.id)),
    themes: own,
    subsectors,
  };
}

// Newest "Baru" row that has a note → banner on the sector page. sector = withRows() result.
function sectorNotice(sector, now = Date.now()) {
  const hits = (sector.subsectors || []).flatMap((s) => s.industries || [])
    .filter((i) => i.updateNote && industryStatus(i, now) === 'new')
    .sort((a, b) => new Date(b.dataUpdatedAt) - new Date(a.dataUpdatedAt));
  if (!hits.length) return null;
  const i = hits[0];
  return { industrySlug: i.slug, industryName: i.name, note: i.updateNote, updatedAt: i.dataUpdatedAt };
}

module.exports = { NEW_WINDOW, industryStatus, sectorStatus, themeCard, withRows, sectorView, sectorNotice };
