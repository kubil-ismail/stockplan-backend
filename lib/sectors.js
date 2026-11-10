'use strict';

const DAY = 24 * 60 * 60 * 1000;
const NEW_WINDOW = 7 * DAY; // "Baru: Data diperbarui 7 hari terakhir"

// Display status: 'soon' (Segera hadir), 'new' (Baru), 'ok' (Siap).
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

function industryView(ind, now, companies = []) {
  return {
    slug: ind.slug,
    name: ind.name,
    icon: ind.icon,
    status: industryStatus(ind, now),
    updatedAt: ind.dataStatus === 'ready' ? ind.dataUpdatedAt : null,
    themeSlug: ind.themeSlug || null,
    ...emitenStats(companies.filter((c) => c.industryId === ind.id)),
  };
}

// sector must include subsectors[].industries[].
function sectorView(sector, now = Date.now(), companies = []) {
  const subsectors = (sector.subsectors || []).map((sub) => ({
    name: sub.name,
    industries: (sub.industries || []).map((i) => industryView(i, now, companies)),
  }));
  const industries = subsectors.flatMap((s) => s.industries);
  return {
    slug: sector.slug,
    name: sector.name,
    icon: sector.icon,
    status: sectorStatus(industries.map((i) => i.status)),
    updatedAt: latest(industries.map((i) => i.updatedAt)),
    subsectorCount: subsectors.length,
    industryCount: industries.length,
    ...emitenStats(companies.filter((c) => c.sectorId === sector.id)),
    subsectors,
  };
}

// Newest "Baru" industry that has a note → banner on the sector page. sector = raw model with includes.
function sectorNotice(sector, now = Date.now()) {
  const hits = (sector.subsectors || []).flatMap((s) => s.industries || [])
    .filter((i) => i.updateNote && industryStatus(i, now) === 'new')
    .sort((a, b) => new Date(b.dataUpdatedAt) - new Date(a.dataUpdatedAt));
  if (!hits.length) return null;
  const i = hits[0];
  return { industrySlug: i.slug, industryName: i.name, note: i.updateNote, updatedAt: i.dataUpdatedAt };
}

module.exports = { NEW_WINDOW, industryStatus, sectorStatus, sectorView, sectorNotice };
