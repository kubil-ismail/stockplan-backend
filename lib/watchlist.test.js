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
