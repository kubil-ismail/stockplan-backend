'use strict';

// Pure logic for the admin "Tema & rantai nilai" pages (AdminTema, AdminTemaBaru, AdminTemaEdit).
const { schema: { str, num, oneOf, arr, obj, BAD } } = require('./adminCompanies');
const { DEFAULT_GROUPS } = require('./themes');
const { industryStatus } = require('./sectors');

const ICONS = ['mine', 'truck', 'bolt', 'factory', 'ship', 'leaf', 'drop', 'store', 'coin'];
// Sector page row icons (same vocabulary as sectors/industries), not the main-group icons above.
const SECTOR_ICONS = ['bolt', 'cube', 'factory', 'basket', 'bag', 'plus', 'bank', 'building', 'chip', 'tower', 'truck', 'flame', 'droplet', 'wrench', 'sun', 'leaf'];
const DATA_STATUS = ['soon', 'ready'];
const COLORS = ['amber', 'blue', 'green', 'violet', 'rose', 'teal', 'stone'];
const READY_MIN = 80; // "Tema baru bisa dibuka kalau minimal 80%."
const LIMITS = { name: 3, description: 160, driver: 100, groupTitle: 20, groupDescription: 80, stageDescription: 90 };
const KEY_RE = /^[a-z0-9-]{1,40}$/;
const TICKER_RE = /^[A-Z]{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MSG = {
  nameShort: 'Nama tema minimal 3 huruf',
  nameTaken: 'Tema dengan nama itu sudah ada',
  unknownSector: 'Sektor tidak dikenal.', // COPY: perlu review
  unknownTickers: (list) => `Kode emiten tidak dikenal: ${list.join(', ')}.`, // COPY: perlu review
  noStage: 'Tambahkan tahap dulu sebelum memetakan emiten.', // COPY: perlu review
  notFound: 'Tema tidak ditemukan.', // COPY: perlu review
  unknownSubsector: 'Sub-sektor tidak ada di sektor ini.', // COPY: perlu review
  subsectorRequired: 'Pilih sub-sektor.', // COPY: perlu review
  incomplete: (label, note) => `Belum bisa terbit: ${label.toLowerCase()}${note ? ` (${note})` : ''}`,
};

const SHAPE = {
  name: str(80),
  sectorSlug: str(80),
  description: str(500),
  drivers: arr(str(LIMITS.driver), 10),
  groups: arr(obj({ key: str(40), title: str(60), description: str(200), icon: oneOf(ICONS), color: oneOf(COLORS) }), 8),
  stages: arr(obj({
    name: str(100), groupKey: str(40), description: str(300),
    rows: arr(obj({ ticker: str(8), pct: num(0, 100), source: str(200) }), 60),
  }), 12),
  // Row on the sector page (TemaSektor). subsectorId '' = not on the sector page.
  sectorMap: obj({ subsectorId: str(36), icon: oneOf(['', ...SECTOR_ICONS]), dataStatus: oneOf(DATA_STATUS), updateNote: str(200) }),
};

// Validates the sections present (PATCH replaces each section whole). Structural only: completeness gates publish.
function validateForm(body) {
  const errors = {};
  const values = {};
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { values, errors: { form: BAD } };
  for (const [k, v] of Object.entries(body)) {
    if (!SHAPE[k]) { errors[k] = 'Bagian tidak dikenal.'; continue; } // COPY: perlu review
    values[k] = SHAPE[k].parse(v, k, errors);
  }
  if (Array.isArray(values.groups)) {
    const seen = new Set();
    values.groups.forEach((g, i) => {
      if (!g) return;
      if (!KEY_RE.test(g.key) || seen.has(g.key)) errors[`groups[${i}].key`] = BAD;
      seen.add(g.key);
    });
  }
  if (values.sectorMap && values.sectorMap.subsectorId && !UUID_RE.test(values.sectorMap.subsectorId)) errors['sectorMap.subsectorId'] = MSG.unknownSubsector;
  if (Array.isArray(values.stages)) {
    values.stages.forEach((s, i) => {
      if (!s) return;
      const seen = new Set();
      s.rows.forEach((r, j) => {
        if (!r) return;
        r.ticker = r.ticker.toUpperCase();
        if (!TICKER_RE.test(r.ticker) || seen.has(r.ticker)) errors[`stages[${i}].rows[${j}].ticker`] = BAD;
        seen.add(r.ticker);
      });
    });
  }
  return { values, errors: Object.keys(errors).length ? errors : null };
}

// POST /admin/api/themes — quick add from AdminTema (name + sector) or the whole AdminTemaBaru form.
function validateCreate(body) {
  const { values, errors } = validateForm(body || {});
  const errs = { ...(errors || {}) };
  if (!errs.name && (values.name || '').length < LIMITS.name) errs.name = MSG.nameShort;
  if (!errs.sectorSlug && !values.sectorSlug) errs.sectorSlug = MSG.unknownSector;
  // Every industry sits in a subsector (theme_industries.subsectorId NOT NULL).
  if (!errs['sectorMap.subsectorId'] && !(values.sectorMap && values.sectorMap.subsectorId)) errs['sectorMap.subsectorId'] = MSG.subsectorRequired;
  const form = { ...emptyForm(), ...values };
  return { form, errors: Object.keys(errs).length ? errs : null };
}

const emptySectorMap = () => ({ subsectorId: '', icon: '', dataStatus: 'soon', updateNote: '' });
const emptyForm = () => ({ name: '', sectorSlug: '', description: '', drivers: [], groups: DEFAULT_GROUPS.map((g) => ({ ...g })), stages: [], sectorMap: emptySectorMap() });

// "Nikel & baterai EV" -> "nikel-baterai-ev"
const slugify = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'tema';

// ---- DB <-> form ----
function columnsToForm(theme, stages) {
  const sorted = [...stages].sort((a, b) => a.order - b.order);
  const used = new Set(sorted.map((s) => s.groupKey));
  const groups = theme.groups || DEFAULT_GROUPS.filter((g) => used.has(g.key)).map((g) => ({ ...g }));
  return {
    name: theme.name,
    sectorSlug: theme.sector ? theme.sector.slug : '',
    description: theme.description || '',
    drivers: theme.drivers || [],
    groups,
    sectorMap: { subsectorId: theme.subsectorId || '', icon: theme.icon || '', dataStatus: theme.dataStatus || 'soon', updateNote: theme.updateNote || '' },
    stages: sorted.map((s) => ({
      name: s.name, groupKey: s.groupKey, description: s.description || '',
      rows: (s.tickers || []).map((t) => {
        const sh = (s.shares || {})[t] || {};
        return { ticker: t, pct: sh.pct ?? null, source: sh.source || '' };
      }),
    })),
  };
}

// Editing form: the draft if any, with sections it lacks (drafts saved before a section existed) filled from columns.
const formOf = (theme) => ({ ...columnsToForm(theme, theme.stages || []), ...(theme.draft || {}) });

// Columns for theme_themes + rows for theme_stages (replaced whole on publish).
function formToColumns(f) {
  const m = f.sectorMap || emptySectorMap();
  return {
    theme: {
      name: f.name, description: f.description || null, drivers: f.drivers, groups: f.groups,
      subsectorId: m.subsectorId || null, icon: m.icon || null, dataStatus: m.dataStatus, updateNote: m.updateNote || null,
    },
    stages: f.stages.map((s, i) => ({
      order: i + 1, groupKey: s.groupKey, name: s.name, description: s.description || null,
      tickers: s.rows.map((r) => r.ticker),
      shares: Object.fromEntries(s.rows.map((r) => [r.ticker, { pct: r.pct, source: r.source }])),
    })),
  };
}

// "Data diperbarui" date for the sector page: stamped when a publish turns the row ready or changes its note.
function dataUpdatedAt(live, next, prevAt, now = new Date()) {
  const a = live.sectorMap || emptySectorMap();
  const b = next.sectorMap || emptySectorMap();
  if (b.dataStatus !== 'ready') return prevAt || null;
  return a.dataStatus !== 'ready' || a.updateNote !== b.updateNote ? now : prevAt || null;
}

// Sector-page-only row: never published as a value chain and no stages. Publishing it fills the sector-map
// columns but leaves publishedAt NULL, so /themes/:slug stays 404.
const isMapOnly = (theme, f) => !theme.publishedAt && f.stages.length === 0;

const formTickers = (f) => [...new Set(f.stages.flatMap((s) => s.rows.map((r) => r.ticker)))];

// ---- derived ----
const filled = (s) => typeof s === 'string' && s.trim() !== '';
const round1 = (x) => Math.round(x * 10) / 10;

// "Emiten di lebih dari satu tahap": total share per ticker across stages must be <= 100%.
function multiStage(f) {
  const by = {};
  f.stages.forEach((s, i) => s.rows.forEach((r) => { (by[r.ticker] = by[r.ticker] || []).push({ stage: i + 1, pct: r.pct }); }));
  return Object.entries(by).filter(([, parts]) => parts.length > 1).map(([ticker, parts]) => {
    const total = round1(parts.reduce((a, p) => a + (p.pct || 0), 0));
    const hasEmpty = parts.some((p) => p.pct === null);
    const over = total > 100;
    return {
      ticker, parts, total, ok: !over && !hasEmpty,
      note: over ? `Lebih ${round1(total - 100)}%` : hasEmpty ? 'Ada porsi kosong' : total < 100 ? 'OK · sisanya di luar tema' : 'OK',
    };
  });
}

// readyMap: ticker -> true when the company is "Siap terbit" in Data emiten.
function readiness(f, readyMap) {
  const tickers = formTickers(f);
  const ready = tickers.filter((t) => readyMap[t]).length;
  return { ready, total: tickers.length, percent: tickers.length ? Math.round((ready / tickers.length) * 100) : 0 };
}

const groupsOk = (f) => f.groups.length > 0 && f.groups.every((g) => filled(g.title) && filled(g.description) && g.title.length <= LIMITS.groupTitle && g.description.length <= LIMITS.groupDescription);

// Sector-map row: the sector page needs a subsector and an icon.
const mapCheck = (f) => {
  const m = f.sectorMap || emptySectorMap();
  return { key: 'sectorMap', label: 'Peta sektor lengkap', ok: !!(m.subsectorId && m.icon), note: m.subsectorId ? 'Pilih ikon' : 'Pilih sub-sektor' }; // COPY: perlu review
};

// Publish conditions ("Siap diterbitkan?"). Each { key, label, ok, note }. Value chain: the 5 conditions
// + sector map (every industry is a sector page row). mapOnly (see isMapOnly): name, sector and sector map only.
function checks(f, readyMap, { mapOnly = false } = {}) {
  const c = (key, label, ok, note) => ({ key, label, ok, note: ok ? '' : note });
  const m = mapCheck(f);
  const map = c(m.key, m.label, m.ok, m.note);
  if (mapOnly) {
    return [
      c('identity', 'Nama & sektor terisi', f.name.length >= LIMITS.name && filled(f.sectorSlug), 'Cek nama & sektor'), // COPY: perlu review
      map,
    ];
  }
  const gKeys = new Set(f.groups.map((g) => g.key));
  const gOk = groupsOk(f);
  const idOk = f.name.length >= LIMITS.name && filled(f.description) && f.description.length <= LIMITS.description && f.drivers.length > 0 && gOk;
  const badStages = f.stages.filter((s) => !s.rows.length || !filled(s.name) || !filled(s.description) || s.description.length > LIMITS.stageDescription || !gKeys.has(s.groupKey)).length;
  const rows = f.stages.flatMap((s) => s.rows);
  const missP = rows.filter((r) => r.pct === null).length;
  const missS = rows.filter((r) => !filled(r.source)).length;
  const over = multiStage(f).filter((m) => m.total > 100).map((m) => m.ticker);
  const rd = readiness(f, readyMap);
  const out = [
    c('identity', 'Identitas & tahap utama lengkap', idOk, gOk ? 'Cek nama & deskripsi' : 'Cek tahap utama'),
    c('stages', 'Tiap tahap punya nama, deskripsi & emiten', f.stages.length > 0 && badStages === 0, badStages ? `${badStages} tahap belum lengkap` : 'Belum ada tahap'),
    c('shares', 'Porsi & sumber terisi', missP === 0 && missS === 0, `${[missP ? `${missP} porsi` : '', missS ? `${missS} sumber` : ''].filter(Boolean).join(', ')} kosong`),
    c('totals', 'Total porsi per emiten ≤ 100%', over.length === 0, over.join(', ')),
    c('readiness', `Kesiapan emiten ≥ ${READY_MIN}%`, rd.percent >= READY_MIN, `${rd.percent}%`),
  ];
  return [...out, map];
}

// ---- list ----
const LIST_STATUS = { published: ['open', 'Terbuka'], draft: ['draft', 'Draf'], review: ['review', 'Perlu ditinjau'] };
const MAP_STATUS = ['map', 'Peta sektor']; // COPY: perlu review — published to the sector page only, no value chain
// Data status as customers see it on the sector page (published columns, not the draft): same rule as lib/sectors.js.
const DATA_LABELS = { soon: 'Segera hadir', ok: 'Siap', new: 'Baru' };
const dataStatusOf = (theme, now = Date.now()) => {
  const key = industryStatus(theme, now);
  return { key, label: DATA_LABELS[key], updatedAt: theme.dataStatus === 'ready' ? theme.dataUpdatedAt || null : null };
};

const EDIT_STATUS = { published: 'Terbuka', draft: 'Draf tersimpan', review: 'Perlu ditinjau' };

function listRow(theme, form, readyMap) {
  const [status, statusLabel] = theme.status === 'published' && !theme.publishedAt ? MAP_STATUS : LIST_STATUS[theme.status];
  const mapOnly = isMapOnly(theme, form);
  const groupOf = Object.fromEntries(form.groups.map((g) => [g.key, g]));
  return {
    slug: theme.slug, name: form.name,
    sector: theme.sector ? { slug: theme.sector.slug, name: theme.sector.name } : null,
    // One dot per stage, colored by its main group ("5 tahap", Hulu → Hulu → … → Hilir).
    chain: form.stages.map((s) => ({ group: groupOf[s.groupKey] ? groupOf[s.groupKey].title : null, color: groupOf[s.groupKey] ? groupOf[s.groupKey].color : 'stone' })),
    stageCount: form.stages.length,
    kind: mapOnly ? 'map' : 'chain',
    icon: form.sectorMap.icon || null, // sector-page icon (Peta sektor), '' -> null
    dataStatus: dataStatusOf(theme),
    readiness: mapOnly ? null : readiness(form, readyMap),
    status, statusLabel,
    hasDraft: !!theme.draft, published: !!theme.publishedAt,
    theses: null, // shortcut: Tesis module not built, upgrade: count theses using this theme
    updatedAt: theme.updatedAt, updatedBy: theme.updatedByName || 'Sistem',
  };
}

const TABS = { all: () => true, open: (r) => r.status === 'open', map: (r) => r.status === 'map', draft: (r) => r.status === 'draft', review: (r) => r.status === 'review' };
function filterList(rows, { q = '', sector = '', tab = 'all' } = {}) {
  const needle = q.trim().toLowerCase();
  const base = rows.filter((r) => (!needle || r.name.toLowerCase().includes(needle)) && (!sector || (r.sector && r.sector.slug === sector)));
  const tabs = Object.fromEntries(Object.entries(TABS).map(([k, f]) => [k, base.filter(f).length]));
  return { tabs, rows: base.filter(TABS[tab] || TABS.all) };
}

// "Emiten belum masuk tema mana pun": IPO first, then biggest. themesFor(company) -> suggested theme or null.
function unmappedQueue(companies, mapped, suggest, limit) {
  const list = companies.filter((c) => !mapped.has(c.ticker))
    .sort((a, b) => (b.status === 'ipo') - (a.status === 'ipo') || (Number(b.marketCap) || 0) - (Number(a.marketCap) || 0) || a.ticker.localeCompare(b.ticker));
  return {
    total: list.length,
    items: list.slice(0, limit).map((c) => {
      const s = suggest(c);
      return {
        ticker: c.ticker, name: c.name, logoUrl: c.logoUrl || null, status: c.status,
        suggestion: s ? { slug: s.slug, name: s.name } : null,
        note: s ? `Usulan sistem dari ${s.via}: ${s.name}` : 'Belum ada tema yang cocok.', // COPY: perlu review
      };
    }),
  };
}

module.exports = {
  ICONS, SECTOR_ICONS, COLORS, DEFAULT_GROUPS, READY_MIN, MSG, TICKER_RE, validateForm, validateCreate, emptyForm, slugify,
  columnsToForm, formOf, formToColumns, dataUpdatedAt, isMapOnly, formTickers, multiStage, readiness, checks, listRow, filterList, unmappedQueue, EDIT_STATUS,
};
