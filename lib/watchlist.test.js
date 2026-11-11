'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { stageOf } = require('./watchlist');

test('stageOf: 0 → baru, 4 → siap, otherwise pel', () => {
  assert.strictEqual(stageOf([false, false, false, false]), 'baru');
  assert.strictEqual(stageOf([true, false, false, false]), 'pel');
  assert.strictEqual(stageOf([true, true, true, false]), 'pel');
  assert.strictEqual(stageOf([true, true, true, true]), 'siap');
  assert.strictEqual(stageOf(), 'baru');
});

const { validatePatch, watchThemes } = require('./watchlist');

test('validatePatch: partial, trims note, checklist must be 4 booleans', () => {
  assert.deepStrictEqual(validatePatch({ note: '  alasan  ' }), { values: { note: 'alasan' }, errors: null });
  assert.deepStrictEqual(validatePatch({ checklist: [true, false, false, true] }).values, { checklist: [true, false, false, true] });
  assert.ok(validatePatch({ checklist: [true, false] }).errors.checklist);
  assert.ok(validatePatch({ checklist: [1, 0, 0, 0] }).errors.checklist);
  assert.ok(validatePatch({ note: 'x'.repeat(2001) }).errors.note);
  assert.ok(validatePatch({ note: 5 }).errors.note);
  assert.ok(validatePatch({}).errors.body);
});

test('watchThemes: groups in stage order, one entry per theme', () => {
  const theme = { slug: 'batubara', name: 'Batubara' };
  const stages = [
    { order: 4, groupKey: 'tengah', tickers: ['AADI'], theme },
    { order: 2, groupKey: 'hulu', tickers: ['AADI', 'BUMI'], theme },
  ];
  assert.deepStrictEqual(watchThemes(stages, 'AADI'), [{ slug: 'batubara', name: 'Batubara', groups: ['hulu', 'tengah'] }]);
  assert.deepStrictEqual(watchThemes(stages, 'BBRI'), []);
});
