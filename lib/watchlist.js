'use strict';

const NOTE_MAX = 2000;
const MSG = {
  noteLong: 'Catatan terlalu panjang.', // COPY: perlu review
  checklist: 'Checklist harus berisi 4 nilai ya/tidak.', // COPY: perlu review
  empty: 'Tidak ada yang diubah.', // COPY: perlu review
};

// HANDOFF §6.6: stage is computed from the 4-step checklist, never stored.
function stageOf(checklist = []) {
  const done = checklist.filter(Boolean).length;
  if (done === 0) return 'baru';
  if (done >= 4) return 'siap';
  return 'pel';
}

const itemView = (w) => ({
  ticker: w.ticker,
  themeName: w.themeName || null,
  note: w.note,
  checklist: w.checklist,
  stage: stageOf(w.checklist),
  savedAt: w.createdAt,
  touchedAt: w.touchedAt,
});

// PATCH /watchlist/:ticker — "Kenapa saya simpan" note and/or the research checklist. Partial update.
function validatePatch(body = {}) {
  const values = {};
  const errors = {};
  if ('note' in body) {
    const note = typeof body.note === 'string' ? body.note.trim() : null;
    if (note === null || note.length > NOTE_MAX) errors.note = MSG.noteLong;
    else values.note = note;
  }
  if ('checklist' in body) {
    const c = body.checklist;
    if (Array.isArray(c) && c.length === 4 && c.every((x) => typeof x === 'boolean')) values.checklist = c;
    else errors.checklist = MSG.checklist;
  }
  if (!Object.keys(values).length && !Object.keys(errors).length) errors.body = MSG.empty;
  return { values, errors: Object.keys(errors).length ? errors : null };
}

// stages: published ThemeStage rows containing the ticker, each with .theme → [{ slug, name, groups }].
function watchThemes(stages, ticker) {
  const byTheme = new Map();
  for (const s of [...stages].sort((a, b) => a.order - b.order)) {
    if (!(s.tickers || []).includes(ticker)) continue;
    const t = byTheme.get(s.theme.slug) || { slug: s.theme.slug, name: s.theme.name, groups: [] };
    if (!t.groups.includes(s.groupKey)) t.groups.push(s.groupKey);
    byTheme.set(s.theme.slug, t);
  }
  return [...byTheme.values()];
}

// GET /watchlist row: item + the company fields the card shows.
const listItemView = (w, stages) => ({
  ...itemView(w),
  company: {
    name: w.company.name,
    logoUrl: w.company.logoUrl || null,
    tagline: w.company.tagline || null,
    summary: w.company.summary || null,
    sector: w.company.sector ? { slug: w.company.sector.slug, name: w.company.sector.name } : null,
    industry: w.company.industry ? { slug: w.company.industry.slug, name: w.company.industry.name } : null,
  },
  themes: watchThemes(stages, w.ticker),
});

module.exports = { NOTE_MAX, MSG, stageOf, itemView, validatePatch, watchThemes, listItemView };
