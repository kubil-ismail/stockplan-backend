'use strict';

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

module.exports = { stageOf, itemView };
