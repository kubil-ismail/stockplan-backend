'use strict';

const test = require('node:test');
const assert = require('node:assert');
const c = require('./companies');

test('ticker helpers', () => {
  assert.strictEqual(c.normTicker(' bumi '), 'BUMI');
  assert.ok(c.isTicker('BUMI'));
  assert.ok(!c.isTicker('BUM1') && !c.isTicker('BUMIX') && !c.isTicker(''));
  assert.strictEqual(c.escapeLike('50%_a\\'), '50\\%\\_a\\\\');
});

test('searchScore order from design', () => {
  assert.strictEqual(c.searchScore({ ticker: 'BUMI', name: 'Bumi Resources' }, 'bumi'), 0);
  assert.strictEqual(c.searchScore({ ticker: 'BUMI', name: 'Bumi Resources' }, 'bu'), 1);
  assert.strictEqual(c.searchScore({ ticker: 'BSDE', name: 'Bumi Serpong Damai' }, 'bumi'), 2);
  assert.strictEqual(c.searchScore({ ticker: 'PTBA', name: 'Bukit Asam' }, 'asam'), 3);
});

const energi = { slug: 'energi', name: 'Energi' };
const properti = { slug: 'properti-real-estat', name: 'Properti & Real Estat' };
const rows = [
  { ticker: 'BSDE', name: 'Bumi Serpong Damai Tbk', sector: properti, marketCap: null, profile: {} },
  { ticker: 'PTBA', name: 'Bukit Asam Tbk', sector: energi, marketCap: '32200000000000', profile: {} },
  { ticker: 'BUMI', name: 'Bumi Resources Tbk', sector: energi, marketCap: '44900000000000', profile: { reports: [{}] } },
];

test('searchResult: sorted like EmitenSearch "bu", facets, best match', () => {
  const r = c.searchResult(rows, 'bu');
  assert.deepStrictEqual(r.companies.map((x) => x.ticker), ['BUMI', 'PTBA', 'BSDE']);
  assert.strictEqual(r.total, 3);
  assert.deepStrictEqual(r.sectors.map((f) => [f.slug, f.count]), [['energi', 2], ['properti-real-estat', 1]]);
  assert.deepStrictEqual(r.companies.map((x) => x.bestMatch), [true, false, false]);
  assert.strictEqual(r.companies[0].hasReport, true);
});

test('searchResult: sector filter keeps facets and total over all matches', () => {
  const r = c.searchResult(rows, 'bu', 'properti-real-estat');
  assert.deepStrictEqual(r.companies.map((x) => x.ticker), ['BSDE']);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.sectors.length, 2);
});

test('ipoView: step state and days to listing in Jakarta time', () => {
  const ipo = {
    listingDate: '2026-11-12',
    schedule: [
      { label: 'Bookbuilding', start: '2026-10-20', end: '2026-10-27' },
      { label: 'Penawaran umum', start: '2026-11-04', end: '2026-11-10' },
      { label: 'Pencatatan', start: '2026-11-12', end: '2026-11-12' },
    ],
  };
  // 2026-11-05 20:00 UTC = 6 Nov 03:00 WIB
  const v = c.ipoView(ipo, new Date('2026-11-05T20:00:00Z'));
  assert.deepStrictEqual(v.schedule.map((s) => s.state), ['done', 'current', 'upcoming']);
  assert.strictEqual(v.daysToListing, 6);
  assert.strictEqual(c.ipoView(null), null);
  // Overlapping day (offer ends 10 Nov, allotment 10 Nov): only one 'current'.
  const overlap = { schedule: [{ start: '2026-11-04', end: '2026-11-10' }, { start: '2026-11-10', end: '2026-11-10' }] };
  assert.deepStrictEqual(c.ipoView(overlap, new Date('2026-11-10T05:00:00Z')).schedule.map((s) => s.state), ['current', 'upcoming']);
});

test('detail hides ipo block for listed companies and spreads profile', () => {
  const d = c.detail({ ticker: 'BUMI', name: 'Bumi', status: 'listed', marketCap: '44900000000000', ipo: { x: 1 }, profile: { overview: 'x' } });
  assert.strictEqual(d.ipo, null);
  assert.strictEqual(d.marketCap, 44.9e12);
  assert.strictEqual(d.overview, 'x');
});

test('delayedView: failedDays from lastUpdatedAt', () => {
  const now = new Date('2026-11-06T09:00:00+07:00');
  const v = c.delayedView({ lastUpdatedAt: '2026-11-04T06:00:00+07:00', nextCheckAt: '2026-11-07T06:00:00+07:00', handling: true }, now);
  assert.strictEqual(v.failedDays, 2);
  assert.strictEqual(v.handling, true);
  assert.strictEqual(c.delayedView(null), null);
});

test('themesView: one entry per theme, stages ordered, stage count', () => {
  const theme = { slug: 'batubara', name: 'Batubara' };
  const stages = [
    { themeId: 't1', theme, order: 4, name: 'Logistik & pengapalan', shortName: 'Logistik', groupKey: 'tengah' },
    { themeId: 't1', theme, order: 2, name: 'Pemilik tambang termal', shortName: 'Pemilik tambang', groupKey: 'hulu' },
  ];
  assert.deepStrictEqual(c.themesView(stages, { t1: 5 }), [{
    slug: 'batubara', name: 'Batubara', stageCount: 5,
    stages: [
      { order: 2, name: 'Pemilik tambang termal', shortName: 'Pemilik tambang', group: 'hulu' },
      { order: 4, name: 'Logistik & pengapalan', shortName: 'Logistik', group: 'tengah' },
    ],
  }]);
  assert.deepStrictEqual(c.themesView([], {}), []);
});
