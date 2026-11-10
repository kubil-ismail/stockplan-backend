'use strict';

const test = require('node:test');
const assert = require('node:assert');
const p = require('./prefs');

test('withDefaults gives §6.8 notification defaults', () => {
  const n = p.withDefaults({}).notifications;
  assert.strictEqual(Object.keys(n).length, 7);
  assert.deepStrictEqual(n.thesis_eval, { inApp: true, email: true });
  assert.deepStrictEqual(n.ipo, { inApp: true, email: false });
});

test('withDefaults keeps stored values and fills missing', () => {
  const r = p.withDefaults({ buyFeePct: 0.2, notifications: { ipo: { email: true } } });
  assert.strictEqual(r.buyFeePct, 0.2);
  assert.strictEqual(r.sellFeePct, 0.25);
  assert.deepStrictEqual(r.notifications.ipo, { inApp: true, email: true });
});

test('validatePrefs accepts partial valid input', () => {
  const { values, errors } = p.validatePrefs({ numberFormat: 'full', buyFeePct: 0.1, defaultEvalEvery: 12, notifications: { ipo: { email: true } } });
  assert.strictEqual(errors, null);
  assert.strictEqual(values.numberFormat, 'full');
});

test('validatePrefs rejects bad input', () => {
  const { errors } = p.validatePrefs({ language: 'en', numberFormat: 'x', glossary: 'yes', buyFeePct: -1, sellFeePct: '0,25', defaultEvalEvery: 5, notifications: { nope: {} } });
  for (const k of ['language', 'numberFormat', 'glossary', 'buyFeePct', 'sellFeePct', 'defaultEvalEvery', 'notifications']) assert.ok(errors[k], k);
  assert.ok(p.validatePrefs({ notifications: { ipo: { sms: true } } }).errors.notifications);
});

test('mergePrefs merges notifications per kind and channel', () => {
  const r = p.mergePrefs({ buyFeePct: 0.3 }, { notifications: { ipo: { email: true } }, glossary: false });
  assert.strictEqual(r.buyFeePct, 0.3);
  assert.strictEqual(r.glossary, false);
  assert.deepStrictEqual(r.notifications.ipo, { inApp: true, email: true });
  assert.deepStrictEqual(r.notifications.thesis_eval, { inApp: true, email: true });
});
