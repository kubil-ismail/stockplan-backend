'use strict';

// Pure logic for the admin "Data emiten" pages (AdminEmiten, AdminEmitenEdit, AdminEmitenIPO):
// form schema, form <-> DB columns, completeness checks, list view, CSV.

// ---- tiny schema DSL: each type returns (value, path, errs) -> normalized value | undefined ----
const BAD = 'Isian tidak valid.'; // COPY: perlu review
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

const str = (max) => ({ def: '', parse: (v, p, e) => {
  if (typeof v !== 'string') return void (e[p] = BAD);
  const s = v.trim();
  if (s.length > max) return void (e[p] = `Maksimal ${max} karakter.`); // COPY: perlu review
  return s;
} });
const num = (min = 0, max = Infinity) => ({ def: null, parse: (v, p, e) => {
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) return void (e[p] = BAD);
  return v;
} });
const date = () => ({ def: null, parse: (v, p, e) => (v === null || v === '' ? null : isDate(v) ? v : void (e[p] = 'Format tanggal YYYY-MM-DD.')) }); // COPY: perlu review
const oneOf = (list) => ({ def: list[0], parse: (v, p, e) => (list.includes(v) ? v : void (e[p] = BAD)) });
const bool = () => ({ def: false, parse: (v, p, e) => (typeof v === 'boolean' ? v : void (e[p] = BAD)) });
const arr = (item, max) => ({ def: [], parse: (v, p, e) => {
  if (!Array.isArray(v) || v.length > max) return void (e[p] = BAD);
  return v.map((x, i) => item.parse(x, `${p}[${i}]`, e));
} });
const obj = (shape) => ({ shape, get def() { return Object.fromEntries(Object.entries(shape).map(([k, t]) => [k, t.def])); }, parse: (v, p, e) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return void (e[p] = BAD);
  const out = {};
  for (const [k, t] of Object.entries(shape)) out[k] = v[k] === undefined ? (Array.isArray(t.def) ? [] : t.def) : t.parse(v[k], p ? `${p}.${k}` : k, e);
  return out;
} });

const TRADING = ['active', 'suspended', 'monitoring', 'delisted']; // design: Aktif, Suspend, Monitoring, Delisted
const RISK_LEVELS = ['high', 'medium', 'low'];
const BOARDS = { utama: 'Utama', pengembangan: 'Pengembangan', akselerasi: 'Akselerasi', baru: 'Ekonomi Baru' };
const PCT = num(0, 100);
const SERIES = obj({ values: arr(num(0), 6), note: str(1000) });

const SCHEMA = obj({
  name: str(120),
  sectorSlug: str(80),
  subsector: str(80),
  trading: obj({ state: oneOf(TRADING), since: date(), source: str(300), reason: str(300) }),
  keyNumbers: obj({
    marketCap: num(0), pbv: num(0), roePct: num(-1000, 1000), grossMarginPct: num(-1000, 1000), debtToAssetPct: num(0, 1000),
    tips: obj({ marketCap: str(400), pbv: str(400), roePct: str(400), grossMarginPct: str(400), debtToAssetPct: str(400) }),
    priceDate: date(), financialPeriod: str(20), asOfSource: str(200),
  }),
  summary: obj({ short: str(500), overview: str(2000), source: str(200) }),
  points: obj({ strengths: arr(str(200), 5), weaknesses: arr(str(200), 5), watchItems: arr(str(200), 5) }),
  trend: obj({
    periods: arr(obj({ label: str(20), span: str(20) }), 6),
    revenue: SERIES, netIncome: SERIES, grossMarginPct: SERIES,
  }),
  revenueSources: arr(obj({ name: str(100), pct: PCT, source: str(200) }), 10),
  group: obj({
    name: str(100),
    subsidiaries: arr(obj({ name: str(100), business: str(200), ownershipPct: PCT, ticker: str(4), show: bool() }), 30),
  }),
  shareholders: obj({ items: arr(obj({ name: str(100), pct: PCT }), 20), note: str(500) }),
  management: obj({ people: arr(obj({ name: str(100), role: str(100) }), 30) }),
  risks: arr(obj({ title: str(100), description: str(500), level: oneOf(RISK_LEVELS) }), 12),
  news: arr(obj({ title: str(300), source: str(100), dateLabel: str(30) }), 10),
  ipo: obj({
    board: oneOf(Object.keys(BOARDS)),
    schedule: obj({ bookbuildingStart: date(), bookbuildingEnd: date(), effective: date(), offerStart: date(), offerEnd: date(), allotment: date(), listing: date() }),
    priceLow: num(0), priceHigh: num(0), priceFinal: num(0),
    sharesOffered: num(0), publicPct: PCT,
    underwriters: arr(str(100), 10),
    warrant: obj({ enabled: bool(), ratio: str(40), price: num(0) }),
    useOfProceeds: arr(obj({ label: str(200), pct: PCT }), 8),
    showUpcoming: bool(), autoConvert: bool(),
  }),
});

const SHAPE = { ...SCHEMA.shape };
// Form of a listed company carries `ipo: null`; echoing it back in PATCH must be fine.
SHAPE.ipo = { shape: SCHEMA.shape.ipo.shape, def: SCHEMA.shape.ipo.def, parse: (v, p, e) => (v === null ? null : SCHEMA.shape.ipo.parse(v, p, e)) };
const TICKER_RE = /^[A-Z]{4}$/;
const MSG = {
  nameRequired: 'Isi nama perusahaan.', // COPY: perlu review
  tickerRequired: 'Kode saham wajib diisi.',
  tickerFormat: 'Kode saham harus 4 huruf.',
  tickerTaken: (t) => `Kode ${t} sudah dipakai emiten lain. Cek lagi kode dari pengumuman BEI.`,
  unknownSector: 'Sektor tidak dikenal.', // COPY: perlu review
  incomplete: (labels) => `Belum bisa terbit: ${labels.join(', ')}`,
};

// Validates the sections that are present; unknown keys are rejected so typos don't silently vanish.
function validateForm(body) {
  const errors = {};
  const values = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { values, errors: { form: BAD } };
  for (const [k, v] of Object.entries(body)) {
    if (!SHAPE[k]) { errors[k] = 'Bagian tidak dikenal.'; continue; } // COPY: perlu review
    values[k] = SHAPE[k].parse(v, k, errors);
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

// POST /admin/api/companies (IPO). Only name + ticker are mandatory to save a draft (design: "Simpan draf").
function validateCreate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const { ticker: rawTicker, ...rest } = b;
  const ticker = String(rawTicker || '').trim().toUpperCase();
  const { values, errors } = validateForm(rest);
  const errs = { ...(errors || {}) };
  if (!ticker) errs.ticker = MSG.tickerRequired;
  else if (!TICKER_RE.test(ticker)) errs.ticker = MSG.tickerFormat;
  if (!errs.name && !(values.name && values.name.trim())) errs.name = MSG.nameRequired;
  return { ticker, form: { ...emptyForm(true), ...values }, errors: Object.keys(errs).length ? errs : null };
}

const emptyForm = (ipo) => {
  const f = {};
  for (const [k, t] of Object.entries(SHAPE)) f[k] = Array.isArray(t.def) ? [] : t.def && typeof t.def === 'object' ? JSON.parse(JSON.stringify(t.def)) : t.def;
  f.ipo = ipo ? f.ipo : null;
  return f;
};

// ---- DB row <-> form ----
const n = (v) => (v === null || v === undefined ? null : Number(v));
const filled = (s) => typeof s === 'string' && s.trim() !== '';
const round2 = (x) => Math.round(x * 100) / 100;
const sum = (list, f) => round2(list.reduce((a, x) => a + (f(x) || 0), 0));
const stepOf = (ipo, label) => (ipo.schedule || []).find((x) => x.label === label) || {};
const boardKey = (label) => Object.keys(BOARDS).find((k) => BOARDS[k] === label) || 'utama';

function ipoToForm(ipo, board) {
  const bb = stepOf(ipo, 'Bookbuilding');
  const pu = stepOf(ipo, 'Penawaran umum');
  return {
    board: boardKey(board),
    schedule: {
      bookbuildingStart: bb.start || null, bookbuildingEnd: bb.end || null, effective: stepOf(ipo, 'Efektif OJK').start || null,
      offerStart: pu.start || null, offerEnd: pu.end || null, allotment: stepOf(ipo, 'Penjatahan').start || null,
      listing: ipo.listingDate || stepOf(ipo, 'Pencatatan').start || null,
    },
    priceLow: n((ipo.priceRange || [])[0]), priceHigh: n((ipo.priceRange || [])[1]), priceFinal: n(ipo.offerPrice),
    sharesOffered: n(ipo.sharesOffered), publicPct: n(ipo.publicPct),
    underwriters: ipo.underwriters || [],
    warrant: ipo.warrant || { enabled: false, ratio: '', price: null },
    useOfProceeds: (ipo.useOfProceeds || []).map((u) => ({ label: u.label, pct: n(u.pct) })),
    showUpcoming: ipo.settings ? ipo.settings.showUpcoming : true,
    autoConvert: ipo.settings ? ipo.settings.autoConvert : true,
  };
}

// Mirrors the shape the customer endpoints already read (seeders/data/companies-detail.js ABNU.ipo).
function formToIpo(f, old = {}) {
  const s = f.schedule;
  const px = f.priceFinal || f.priceHigh;
  const sharesTotal = f.publicPct > 0 && f.sharesOffered ? Math.round(f.sharesOffered / (f.publicPct / 100)) : null;
  const proceeds = f.priceFinal && f.sharesOffered ? f.priceFinal * f.sharesOffered : null;
  const steps = [['Bookbuilding', s.bookbuildingStart, s.bookbuildingEnd], ['Efektif OJK', s.effective, s.effective],
    ['Penawaran umum', s.offerStart, s.offerEnd], ['Penjatahan', s.allotment, s.allotment], ['Pencatatan', s.listing, s.listing]];
  return {
    ...old,
    offerPrice: f.priceFinal,
    priceRange: f.priceLow && f.priceHigh ? [f.priceLow, f.priceHigh] : null,
    sharesOffered: f.sharesOffered, sharesTotal, proceeds,
    valueAtOffer: px && sharesTotal ? px * sharesTotal : null,
    publicPct: f.publicPct,
    prospectusDate: s.bookbuildingStart, listingDate: s.listing,
    schedule: steps.filter((x) => x[1]).map(([label, start, end]) => ({ label, start, end: end || start })),
    useOfProceeds: f.useOfProceeds.map((u) => ({ label: u.label, amount: proceeds ? Math.round(proceeds * u.pct / 100) : null, pct: u.pct })),
    underwriters: f.underwriters.filter(filled),
    warrant: f.warrant,
    settings: { showUpcoming: f.showUpcoming, autoConvert: f.autoConvert }, // shortcut: stored only, nothing reads these yet, upgrade: IPO list + auto switch to "listed" on listing date
  };
}

// row: Company with `sector` and `industry` loaded.
function columnsToForm(row) {
  const p = row.profile || {};
  const m = row.metrics || {};
  const f = p.financials || {};
  const tips = p.keyTips || {};
  const series = (x) => ({ values: (x && x.values) || [], note: (x && x.note) || '' });
  const tr = p.trading || { state: row.status === 'suspended' ? 'suspended' : 'active', since: null, source: '', reason: '' };
  return {
    name: row.name || '',
    sectorSlug: row.sector ? row.sector.slug : '',
    subsector: row.industry ? row.industry.name : p.subsector || '',
    trading: { state: tr.state, since: tr.since || null, source: tr.source || '', reason: tr.reason || '' },
    keyNumbers: {
      marketCap: n(row.marketCap), pbv: n(m.pbv), roePct: n(m.roePct), grossMarginPct: n(m.grossMarginPct), debtToAssetPct: n(m.debtToAssetPct),
      tips: { marketCap: tips.marketCap || '', pbv: tips.pbv || '', roePct: tips.roePct || '', grossMarginPct: tips.grossMarginPct || '', debtToAssetPct: tips.debtToAssetPct || '' },
      priceDate: row.priceDate || null, financialPeriod: row.financialPeriod || '', asOfSource: p.asOfSource || '',
    },
    summary: { short: row.summary || '', overview: p.overview || '', source: p.overviewSource || '' },
    points: { strengths: p.strengths || [], weaknesses: p.weaknesses || [], watchItems: p.watchItems || [] },
    trend: {
      periods: (f.periods || []).map((x) => ({ label: x.label, span: x.span || '' })),
      revenue: series(f.revenue), netIncome: series(f.netIncome), grossMarginPct: series(f.grossMarginPct),
    },
    revenueSources: (p.revenueSources || []).map((r) => ({ name: r.name, pct: n(r.pct), source: r.source || '' })),
    group: {
      name: row.groupName || '',
      subsidiaries: (p.subsidiaries || []).map((x) => ({ name: x.name, business: x.business || '', ownershipPct: n(x.ownershipPct), ticker: x.ticker || '', show: x.show !== false })),
    },
    shareholders: {
      items: ((p.shareholders && p.shareholders.items) || []).filter((i) => !i.public).map((i) => ({ name: i.name, pct: n(i.pct) })),
      note: (p.shareholders && p.shareholders.note) || '',
    },
    management: { people: ((p.management && p.management.people) || []).map((x) => ({ name: x.name, role: x.role })) },
    risks: (p.risks || []).map((r) => ({ title: r.title, description: r.description, level: r.level })),
    news: (p.news || []).map((x) => ({ title: x.title, source: x.source || '', dateLabel: x.dateLabel || '' })),
    ipo: row.status === 'ipo' ? ipoToForm(row.ipo || {}, row.listingBoard) : null,
  };
}

// Form -> columns to write on publish. `sectorSlug`/`subsector` are resolved to ids by the controller.
function formToColumns(f, row) {
  const old = row.profile || {};
  const oldFin = old.financials || {};
  const fin = { ...oldFin, periods: f.trend.periods, revenue: f.trend.revenue, netIncome: f.trend.netIncome, grossMarginPct: f.trend.grossMarginPct };
  const people = f.management.people;
  const publicPct = round2(100 - sum(f.shareholders.items, (i) => i.pct));
  const attrs = {
    name: f.name,
    summary: f.summary.short || null,
    marketCap: f.keyNumbers.marketCap,
    metrics: { pbv: f.keyNumbers.pbv, roePct: f.keyNumbers.roePct, grossMarginPct: f.keyNumbers.grossMarginPct, debtToAssetPct: f.keyNumbers.debtToAssetPct },
    priceDate: f.keyNumbers.priceDate,
    financialPeriod: f.keyNumbers.financialPeriod || null,
    groupName: f.group.name || null,
    status: f.trading.state === 'suspended' ? 'suspended' : row.status === 'suspended' ? 'listed' : row.status,
    profile: {
      ...old,
      overview: f.summary.overview, overviewSource: f.summary.source,
      strengths: f.points.strengths, weaknesses: f.points.weaknesses, watchItems: f.points.watchItems,
      keyTips: f.keyNumbers.tips, asOfSource: f.keyNumbers.asOfSource,
      trading: f.trading, subsector: f.subsector,
      financials: fin,
      revenueSources: f.revenueSources,
      subsidiaries: f.group.subsidiaries,
      shareholders: {
        items: [...f.shareholders.items, ...(publicPct > 0 ? [{ name: 'Publik (free float)', pct: publicPct, public: true }] : [])],
        note: f.shareholders.note,
      },
      management: { ...(old.management || {}), total: Math.max((old.management && old.management.total) || 0, people.length), people },
      risks: f.risks, news: f.news,
    },
  };
  if (row.status === 'ipo' && f.ipo) {
    attrs.listingBoard = BOARDS[f.ipo.board];
    attrs.ipo = formToIpo(f.ipo, row.ipo || {});
  }
  return attrs;
}

// ---- completeness ----
const inRange = (s, max) => filled(s) && s.length <= max;
const listOk = (list, max, item) => list.length > 0 && list.length <= max && list.every(item);

const IPO_ORDER = [['bookbuildingStart', 'mulai bookbuilding'], ['bookbuildingEnd', 'akhir bookbuilding'], ['effective', 'tanggal efektif'],
  ['offerStart', 'mulai penawaran umum'], ['offerEnd', 'akhir penawaran umum'], ['allotment', 'penjatahan'], ['listing', 'pencatatan']];

// Design: "Tanggal akhir bookbuilding tidak boleh sebelum mulai bookbuilding." (dates must not go backwards)
function scheduleError(s) {
  let prev = null;
  for (const [k, label] of IPO_ORDER) {
    if (!s[k]) continue;
    if (prev && s[k] < s[prev[0]]) return `Tanggal ${label} tidak boleh sebelum ${prev[1]}.`;
    prev = [k, label];
  }
  return '';
}

function priceError(i) {
  if (i.priceLow && i.priceHigh && i.priceLow > i.priceHigh) return 'Harga bawah lebih tinggi dari harga atas.';
  if (i.priceFinal && i.priceLow && i.priceHigh && (i.priceFinal < i.priceLow || i.priceFinal > i.priceHigh)) return `Harga final di luar rentang bookbuilding (Rp${i.priceLow}–${i.priceHigh}).`;
  return '';
}

// Publish checklist ("Kelengkapan"). Each: { key, label, ok, note }.
// shortcut: Laporan keuangan (XBRL/PDF), Prospektus, and logo are not checked: no file storage yet, upgrade: add with the upload module.
function sections(f, isIpo = false) {
  const s = (key, label, ok, note) => ({ key, label, ok, note: ok ? '' : note });
  const idBase = filled(f.name) && filled(f.subsector);
  const shortOk = inRange(f.summary.short, 100);
  if (isIpo) {
    const i = f.ipo || emptyForm(true).ipo;
    const sErr = scheduleError(i.schedule);
    const pErr = priceError(i);
    const tot = sum(i.useOfProceeds, (u) => u.pct);
    return [
      s('identity', 'Identitas', idBase && shortOk && inRange(f.summary.overview, 400), idBase ? 'Deskripsi kosong/terlalu panjang' : 'Ada yang kosong'),
      s('schedule', 'Jadwal IPO', !!i.schedule.listing && !sErr, i.schedule.listing ? sErr : 'Tgl. pencatatan kosong'),
      s('offering', 'Detail penawaran', !pErr && !!((i.priceLow && i.priceHigh) || i.priceFinal) && i.sharesOffered > 0 && i.publicPct > 0 && i.underwriters.some(filled), pErr || 'Ada yang kosong'),
      s('proceeds', 'Penggunaan dana', tot === 100 && i.useOfProceeds.every((u) => filled(u.label)), `Total ${tot}%`),
    ];
  }
  const tr = f.trading;
  const k = f.keyNumbers;
  const t = f.trend;
  const revTot = sum(f.revenueSources, (r) => r.pct);
  const shTot = sum(f.shareholders.items, (x) => x.pct);
  const missingSrc = f.revenueSources.filter((r) => !filled(r.source)).length;
  const pointsOk = [f.points.strengths, f.points.weaknesses, f.points.watchItems].every((l) => listOk(l, 5, (x) => inRange(x, 60)));
  const trendOk = t.periods.length >= 2 && [t.revenue, t.netIncome, t.grossMarginPct].every((x) => x.values.length === t.periods.length && x.values.every((v) => v !== null) && filled(x.note));
  return [
    s('identity', 'Identitas & status', idBase && (tr.state === 'active' || (!!tr.since && filled(tr.source) && filled(tr.reason))), idBase ? 'Lengkapi status' : 'Nama/kode'),
    s('keyNumbers', 'Angka utama', [k.marketCap, k.pbv, k.roePct, k.grossMarginPct, k.debtToAssetPct].every((v) => v !== null), 'Ada yang kosong'),
    s('summary', 'Ringkasan bisnis', inRange(f.summary.overview, 400) && filled(f.summary.source) && shortOk, shortOk ? 'Perlu dicek' : 'Deskripsi singkat kosong/terlalu panjang'),
    s('points', 'Poin kekuatan dkk.', pointsOk, 'Kosong / >60 karakter'),
    s('trend', 'Tren keuangan', trendOk, 'Ada sel kosong'),
    s('revenue', 'Sumber pendapatan', revTot === 100 && missingSrc === 0 && f.revenueSources.every((r) => filled(r.name)), revTot !== 100 ? (revTot < 100 ? `kurang ${round2(100 - revTot)}%` : `lebih ${round2(revTot - 100)}%`) : `${missingSrc} segmen belum punya sumber`),
    s('group', 'Struktur grup', listOk(f.group.subsidiaries, 30, (x) => filled(x.name) && x.ownershipPct > 0), 'Cek porsi'),
    s('shareholders', 'Pemegang saham', shTot <= 100 && f.shareholders.items.every((x) => filled(x.name) && x.pct > 0), 'Total >100%'),
    s('management', 'Manajemen', listOk(f.management.people, 30, (x) => filled(x.name) && filled(x.role)), 'Ada yang kosong'),
    s('risks', 'Risiko utama', listOk(f.risks, 12, (x) => filled(x.title) && filled(x.description)), 'Ada yang kosong'),
    s('news', 'Berita', f.news.every((x) => filled(x.title) && filled(x.source) && filled(x.dateLabel)), 'Ada yang kosong'),
    { key: 'theme', label: 'Tema & rantai nilai', ok: true, note: '' }, // owned by the Tema module
  ];
}

// The 5 coarse parts shown as "Kelengkapan 4/5" in the list.
const LIST_PARTS = ['Profil BEI', 'Ringkasan bisnis', 'Sumber pendapatan', 'Anak usaha', 'Pemetaan tema'];
function listCompleteness(f, hasTheme) {
  const ok = [
    filled(f.name) && filled(f.sectorSlug) && filled(f.subsector),
    filled(f.summary.short) && filled(f.summary.overview),
    f.revenueSources.length > 0 && sum(f.revenueSources, (r) => r.pct) === 100,
    f.group.subsidiaries.length > 0,
    hasTheme,
  ];
  return { done: ok.filter(Boolean).length, total: LIST_PARTS.length, missing: LIST_PARTS.filter((_, i) => !ok[i]) };
}

// ---- status + list ----
const LIST_STATUS = { ok: 'Siap terbit', review: 'Perlu ditinjau', draft: 'Draf', new: 'IPO baru' };
const EDIT_STATUS = { published: 'Terbit', review: 'Perlu ditinjau', draft: 'Draf tersimpan' };
// 'new' = IPO company that nobody has published yet (design: badge "IPO baru").
const listStatus = (row) => (row.publishStatus === 'draft' && row.status === 'ipo' ? 'new' : row.publishStatus === 'published' ? 'ok' : row.publishStatus);

// themeInfo: { name, stageCount } | undefined
const themeLabel = (t) => (t ? `${t.name}${t.stageCount > 1 ? ` · ${t.stageCount} tahap` : ''}` : 'Belum dipetakan');

function listItem(row, themeInfo) {
  const form = row.draft || columnsToForm(row);
  const status = listStatus(row);
  return {
    ticker: row.ticker, name: form.name || row.name, logoUrl: row.logoUrl || null,
    sector: row.sector ? { slug: row.sector.slug, name: row.sector.name } : null,
    completeness: listCompleteness(form, !!themeInfo),
    theme: themeLabel(themeInfo),
    status, statusLabel: LIST_STATUS[status],
    reportCount: 0, // shortcut: user reports ("Masukan & laporan") not built, upgrade: count open tickets per ticker
    hasDraft: !!row.draft,
    updatedAt: row.updatedAt, updatedBy: row.updatedByName || 'Sistem',
  };
}

// Tab counts follow the search + sector filter (design), the tab itself filters the rows.
const TABS = { all: () => true, review: (r) => r.status === 'review', incomplete: (r) => r.completeness.done < r.completeness.total, ready: (r) => r.status === 'ok' };
function filterList(items, { q = '', sector = '', tab = 'all' } = {}) {
  const needle = q.trim().toLowerCase();
  const base = items.filter((r) => (!needle || `${r.ticker} ${r.name}`.toLowerCase().includes(needle)) && (!sector || (r.sector && r.sector.slug === sector)));
  const tabs = Object.fromEntries(Object.entries(TABS).map(([k, f]) => [k, base.filter(f).length]));
  const rows = base.filter(TABS[tab] || TABS.all).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt) || a.ticker.localeCompare(b.ticker));
  return { tabs, rows };
}

// ---- CSV ----
// Cells starting with = + - @ are prefixed with ' so spreadsheets don't run them as formulas.
const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function toCsv(items) {
  const head = ['Kode', 'Nama', 'Sektor', 'Kelengkapan', 'Tema', 'Status', 'Diperbarui', 'Diperbarui oleh'];
  const lines = items.map((r) => [r.ticker, r.name, r.sector ? r.sector.name : '', `${r.completeness.done}/${r.completeness.total}`, r.theme, r.statusLabel, new Date(r.updatedAt).toISOString(), r.updatedBy].map(cell).join(','));
  return `${[head.map(cell).join(','), ...lines].join('\r\n')}\r\n`;
}

module.exports = {
  MSG, BOARDS, TICKER_RE, validateForm, validateCreate, emptyForm, columnsToForm, formToColumns, ipoToForm, formToIpo,
  sections, scheduleError, priceError, listCompleteness, listStatus, listItem, filterList, toCsv, LIST_STATUS, EDIT_STATUS,
};
