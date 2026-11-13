'use strict';

// Pure logic for the client Beranda (HANDOFF §6.1): "Perlu tindakan", IPO mendatang, Alokasi.
// Blocks that need the Tesis module or the BEI disclosure feed are not built here (see controllers/dashboardController.js).
const { ipoView } = require('./companies');

const IPO_WINDOW_DAYS = 14; // "IPO mendatang: 14 hari ke depan"
const IPO_MAX = 10;
const CONCENTRATION_PCT = 40; // "PTBA 46%: lebih dari 40% portofolio di satu emiten."
const ALLOC_MAX = 6; // donut slices; the tail is grouped as "Lainnya"
// shortcut: the 40% rule is applied per emiten only; the per-theme warning appears only when one theme holds 100%
// (the design's single example), upgrade: confirm a threshold with product.

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

// ---- Perlu tindakan ----
// Copy is the design's (Main.dc.html). One card per event: a new suspension date is a new id, so it shows again after "Selesai".
const SUSPENSION = {
  title: (t) => `Perdagangan saham ${t} dihentikan sementara`,
  why: 'Saham tidak bisa dijual atau dibeli selama suspensi. Baca alasan di pengumuman sebelum memutuskan apa pun.',
  src: 'Pengumuman Bursa · BEI',
  cta: 'Baca pengumuman',
};

// held: company rows the user holds that are suspended: { ticker, profile }.
function suspensionActions(held) {
  return held.map((c) => {
    const tr = (c.profile && c.profile.trading) || {};
    const since = /^\d{4}-\d{2}-\d{2}$/.test(tr.since || '') ? tr.since : null;
    return {
      id: `suspension-${c.ticker}-${since || 'na'}`, ticker: c.ticker, kind: 'suspension', tone: 'red', label: 'Suspensi',
      at: since, title: SUSPENSION.title(c.ticker), why: SUSPENSION.why, src: (tr.source && String(tr.source).trim()) || SUSPENSION.src,
      cta: SUSPENSION.cta, href: `/emiten/${c.ticker}`,
    };
  });
}

// ---- IPO mendatang ----
// rows: published IPO companies { ticker, name, logoUrl, ipo }. Listing within the next 14 days (Asia/Jakarta), soonest first.
function ipoItems(rows, now = new Date()) {
  return rows
    .map((c) => {
      const v = ipoView(c.ipo, now);
      if (!v || v.daysToListing === null || v.daysToListing < 0 || v.daysToListing > IPO_WINDOW_DAYS) return null;
      const step = v.schedule.find((s) => s.state === 'current') || v.schedule.find((s) => s.state === 'upcoming') || null;
      return {
        ticker: c.ticker, name: c.name, logoUrl: c.logoUrl || null,
        stage: step ? step.label : null, stageStart: step ? step.start || null : null, stageEnd: step ? step.end || null : null,
        listingDate: v.listingDate, daysToListing: v.daysToListing,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.listingDate.localeCompare(b.listingDate) || a.ticker.localeCompare(b.ticker))
    .slice(0, IPO_MAX);
}

// "Jadwal mendatang": for now only listings of IPOs the user asked to be reminded about ("Ingatkan saat tercatat").
const schedule = (ipos, alertTickers) => ipos
  .filter((i) => alertTickers.includes(i.ticker))
  .map((i) => ({ kind: 'ipo_listing', ticker: i.ticker, at: i.listingDate }));

// ---- Alokasi ----
// Whole percents that always add up to 100 (largest remainder), so the donut closes.
function shares(values) {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const pcts = exact.map(Math.floor);
  let left = 100 - pcts.reduce((a, b) => a + b, 0);
  exact.map((e, i) => [e - pcts[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i]) => { if (left-- > 0) pcts[i] += 1; });
  return pcts;
}

// rows: [{ label, value, href }] → biggest first, at most ALLOC_MAX slices (the rest become "Lainnya").
function slices(rows) {
  const sorted = [...rows].sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const pcts = shares(sorted.map((r) => r.value));
  const all = sorted.map((r, i) => ({ label: r.label, pct: pcts[i], href: r.href }));
  if (all.length <= ALLOC_MAX) return all;
  const rest = all.slice(ALLOC_MAX - 1);
  return [...all.slice(0, ALLOC_MAX - 1), { label: 'Lainnya', pct: rest.reduce((a, s) => a + s.pct, 0), href: '/portofolio' }];
}

// holdings: portfolio holding views ({ ticker, capital, theme }). Capital-based (lots × 100 × average price), not market value.
function allocation(holdings) {
  const stock = holdings.reduce((a, h) => a + h.capital, 0);
  const out = { total: stock, count: holdings.length, slices: { emiten: [], tema: [], tesis: [] }, warnings: {} }; // tesis: Tesis module
  if (!stock) return out;

  out.slices.emiten = slices(holdings.map((h) => ({ label: h.ticker, value: h.capital, href: `/emiten/${h.ticker}` })));
  const byTheme = new Map();
  for (const h of holdings) {
    const key = h.theme ? h.theme.slug : '';
    const t = byTheme.get(key) || { label: h.theme ? h.theme.name : 'Tanpa tema', value: 0, href: h.theme ? `/tema/${h.theme.slug}` : '/portofolio' };
    t.value += h.capital;
    byTheme.set(key, t);
  }
  out.slices.tema = slices([...byTheme.values()]);

  const top = out.slices.emiten[0];
  if (top.label !== 'Lainnya' && top.pct > CONCENTRATION_PCT) out.warnings.emiten = `${top.label} ${top.pct}%: lebih dari ${CONCENTRATION_PCT}% portofolio di satu emiten.`;
  const [theme] = out.slices.tema;
  if (out.slices.tema.length === 1 && theme.pct === 100 && theme.label !== 'Tanpa tema') {
    out.warnings.tema = `100% portofolio di satu tema. Satu kebijakan soal ${theme.label} bisa memengaruhi seluruh portofolio.`; // COPY: perlu review (design example uses "batubara")
  }
  return out;
}

module.exports = { IPO_WINDOW_DAYS, ALLOC_MAX, firstName, suspensionActions, ipoItems, schedule, shares, slices, allocation };
