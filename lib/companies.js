'use strict';

const TICKER_RE = /^[A-Z]{4}$/;
const normTicker = (v) => String(v || '').trim().toUpperCase();
const isTicker = (v) => TICKER_RE.test(v);

// Escape LIKE wildcards in user input.
const escapeLike = (q) => q.replace(/[\\%_]/g, '\\$&');

// Lower is better (design/screens/EmitenSearch.dc.html): exact ticker, ticker prefix, name prefix, other match.
function searchScore(c, q) {
  const t = c.ticker.toLowerCase();
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (c.name.toLowerCase().startsWith(q)) return 2;
  return 3;
}

// pg returns BIGINT as string; market caps stay far below 2^53.
const num = (v) => (v === null || v === undefined ? null : Number(v));

const ref = (x) => (x ? { slug: x.slug, name: x.name } : null);

function card(c) {
  return {
    ticker: c.ticker,
    name: c.name,
    logoUrl: c.logoUrl || null,
    status: c.status,
    summary: c.summary || null,
    sector: ref(c.sector),
    industry: ref(c.industry),
    sizeClass: c.sizeClass || null,
    hasReport: Array.isArray(c.profile && c.profile.reports) && c.profile.reports.length > 0,
  };
}

// Sorts matches, builds sector facets, then applies the sector filter (facets count all matches).
function searchResult(rows, q, sectorSlug) {
  const sorted = rows
    .map((c) => ({ c, s: searchScore(c, q) }))
    .sort((a, b) => a.s - b.s || (num(b.c.marketCap) || 0) - (num(a.c.marketCap) || 0) || a.c.ticker.localeCompare(b.c.ticker))
    .map((x) => x.c);
  const facets = new Map();
  for (const c of sorted) {
    if (!c.sector) continue;
    const f = facets.get(c.sector.slug) || { slug: c.sector.slug, name: c.sector.name, count: 0 };
    f.count += 1;
    facets.set(c.sector.slug, f);
  }
  const shown = sectorSlug ? sorted.filter((c) => c.sector && c.sector.slug === sectorSlug) : sorted;
  return {
    total: sorted.length,
    sectors: [...facets.values()],
    companies: shown.map((c, i) => ({ ...card(c), bestMatch: i === 0 && !sectorSlug && searchScore(c, q) <= 1 })),
  };
}

// "YYYY-MM-DD" in Asia/Jakarta; IPO dates are local exchange dates.
const jakartaDate = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);

const DAY = 24 * 60 * 60 * 1000;

// Adds state per step ('done' | 'current' | 'upcoming') and days until listing ("Tercatat di BEI dalam 6 hari").
function ipoView(ipo, now = new Date()) {
  if (!ipo) return null;
  const today = jakartaDate(now);
  // Steps can share a date (offer ends the day allotment starts); only the first open step is 'current'.
  let currentTaken = false;
  const schedule = (ipo.schedule || []).map((st) => {
    let state = 'upcoming';
    if ((st.end || st.start) < today) state = 'done';
    else if (st.start <= today && !currentTaken) { state = 'current'; currentTaken = true; }
    return { ...st, state };
  });
  const daysToListing = ipo.listingDate ? Math.round((Date.parse(ipo.listingDate) - Date.parse(today)) / DAY) : null;
  return { ...ipo, schedule, daysToListing };
}

// Banner "Data BEI … belum diperbarui sejak …" — failedDays = "gagal 2 hari terakhir".
function delayedView(d, now = new Date()) {
  if (!d) return null;
  const since = d.lastUpdatedAt ? Date.parse(d.lastUpdatedAt) : NaN;
  return { ...d, failedDays: Number.isNaN(since) ? null : Math.max(0, Math.floor((now.getTime() - since) / DAY)) };
}

// stages: ThemeStage rows containing the ticker, each with .theme (the industry); stageCounts: { industryId: n }.
// One entry per theme, stages in order → badge "Batubara · Tahap 2 dari 5 · Pemilik tambang termal".
function themesView(stages, stageCounts) {
  const byTheme = new Map();
  for (const st of [...stages].sort((a, b) => a.order - b.order)) {
    const t = byTheme.get(st.industryId) || {
      slug: st.theme.slug, name: st.theme.name, stageCount: stageCounts[st.industryId] || 0, stages: [],
    };
    t.stages.push({ order: st.order, name: st.name, shortName: st.shortName || null, group: st.groupKey });
    byTheme.set(st.industryId, t);
  }
  return [...byTheme.values()];
}

function detail(c, now = new Date()) {
  return {
    ...card(c),
    listingBoard: c.listingBoard || null,
    listedYear: c.listedYear || null,
    groupName: c.groupName || null,
    tagline: c.tagline || null,
    marketCap: num(c.marketCap),
    metrics: c.metrics || null,
    financialPeriod: c.financialPeriod || null,
    priceDate: c.priceDate || null,
    dataDelayed: delayedView(c.dataDelayed, now),
    ...c.profile,
    ipo: c.status === 'ipo' ? ipoView(c.ipo, now) : null,
  };
}

const peer = (c) => ({ ticker: c.ticker, name: c.name, logoUrl: c.logoUrl || null, tagline: c.tagline || null, marketCap: num(c.marketCap) });

// Biggest first, for sector/industry avatars and peer lists.
const byMarketCap = (a, b) => (num(b.marketCap) || 0) - (num(a.marketCap) || 0) || a.ticker.localeCompare(b.ticker);

module.exports = { jakartaDate, ipoView, delayedView, themesView, normTicker, isTicker, escapeLike, searchScore, searchResult, card, detail, peer, byMarketCap, num };
