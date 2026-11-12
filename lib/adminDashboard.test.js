'use strict';

const test = require('node:test');
const assert = require('node:assert');
const d = require('./adminDashboard');

test('percent: rounds, zero total is 0', () => {
  assert.strictEqual(d.percent(412, 958), 43);
  assert.strictEqual(d.percent(0, 0), 0);
});

test('monthRange: Jakarta month, December rolls to next year', () => {
  assert.deepStrictEqual(d.monthRange(new Date('2026-11-12T05:00:00Z')), { from: '2026-11-01', to: '2026-12-01' });
  assert.deepStrictEqual(d.monthRange(new Date('2026-12-15T05:00:00Z')), { from: '2026-12-01', to: '2027-01-01' });
  // 23.30 UTC on 30 Nov is already 1 Dec in Jakarta
  assert.deepStrictEqual(d.monthRange(new Date('2026-11-30T23:30:00Z')), { from: '2026-12-01', to: '2027-01-01' });
});

test('ipoSub: names then "dan N emiten lain"', () => {
  assert.strictEqual(d.ipoSub(['CDIA'], 2), 'CDIA dan 1 emiten lain');
  assert.strictEqual(d.ipoSub(['CDIA', 'ABNU'], 2), 'CDIA, ABNU');
  assert.strictEqual(d.ipoSub([], 0), '');
});

test('queue: drops empty and forbidden items, sorts by level then count', () => {
  const counts = { beiChanges: 5, companyReview: 37, themeReview: 0, noSource: 41, ipoNew: 2, ipoTickers: ['CDIA'], noSummary: 318 };
  const all = d.queue(counts, { em: true, tm: true, sync: true });
  assert.deepStrictEqual(all.map((i) => i.key), ['no_source', 'company_review', 'bei_changes', 'no_summary', 'ipo_new']);
  assert.strictEqual(all[0].levelLabel, 'Sedang');
  assert.ok(!('module' in all[0]));
  assert.strictEqual(all.find((i) => i.key === 'ipo_new').sub, 'CDIA dan 1 emiten lain');
  // Support-like role: em only, no sync, no tm
  assert.deepStrictEqual(d.queue(counts, { em: true }).map((i) => i.key), ['no_source', 'company_review', 'no_summary', 'ipo_new']);
  assert.deepStrictEqual(d.queue(counts, {}), []);
});

test('coverage: chains with companies only, open first, openable at the threshold', () => {
  const row = (name, status, ready, total, kind = 'chain') => ({ slug: name, name, kind, status, statusLabel: status, stageCount: 3, readiness: kind === 'map' ? null : { ready, total, percent: total ? Math.round((ready / total) * 100) : 0 } });
  const out = d.coverage([
    row('Gas', 'draft', 3, 7), row('Peta', 'map', 0, 0, 'map'), row('Kosong', 'open', 0, 0), row('Bank', 'open', 15, 18), row('Batubara', 'open', 19, 21), row('Nikel', 'review', 6, 11),
  ], 80);
  assert.deepStrictEqual(out.map((r) => r.name), ['Batubara', 'Bank', 'Nikel', 'Gas']);
  assert.deepStrictEqual(out.map((r) => r.openable), [true, true, false, false]); // 90, 83, 55, 43
  assert.strictEqual(out.length <= d.COVERAGE_MAX, true);
});

test('activity: flattens the Riwayat entry', () => {
  const e = { id: '1', at: 'T', actor: { name: 'Rina', kind: 'admin' }, verb: 'memperbarui tren keuangan', target: 'BUMI', rest: '(draf)', changes: [{}] };
  assert.deepStrictEqual(d.activity(e), { id: '1', at: 'T', actor: 'Rina', verb: 'memperbarui tren keuangan', target: 'BUMI', rest: '(draf)' });
});
