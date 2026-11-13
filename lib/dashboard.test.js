'use strict';

const test = require('node:test');
const assert = require('node:assert');
const d = require('./dashboard');

const NOW = new Date('2026-11-12T05:00:00Z'); // 12 Nov, 12.00 WIB

test('firstName', () => {
  assert.strictEqual(d.firstName('Budi Santoso'), 'Budi');
  assert.strictEqual(d.firstName('  Bil  '), 'Bil');
  assert.strictEqual(d.firstName(''), '');
  assert.strictEqual(d.firstName(null), '');
});

test('shares: whole percents that always sum to 100', () => {
  assert.deepStrictEqual(d.shares([46, 32, 22]), [46, 32, 22]);
  assert.deepStrictEqual(d.shares([1, 1, 1]), [34, 33, 33]); // remainder goes to the first of equals
  assert.deepStrictEqual(d.shares([100]), [100]);
  assert.deepStrictEqual(d.shares([0, 0]), [0, 0]);
  for (const vals of [[7, 11, 13, 17, 19], [1, 2, 3, 4, 5, 6, 7], [999, 1], [333, 333, 334]]) assert.strictEqual(d.shares(vals).reduce((a, b) => a + b, 0), 100);
});

test('slices: biggest first, capped with "Lainnya"', () => {
  const rows = Array.from({ length: 9 }, (_, i) => ({ label: `T${i}`, value: 100 - i * 10, href: `/emiten/T${i}` }));
  const s = d.slices(rows);
  assert.strictEqual(s.length, d.ALLOC_MAX);
  assert.strictEqual(s[0].label, 'T0');
  assert.strictEqual(s[s.length - 1].label, 'Lainnya');
  assert.strictEqual(s.reduce((a, x) => a + x.pct, 0), 100);
  assert.strictEqual(d.slices(rows.slice(0, 3)).length, 3); // no "Lainnya" when it fits
});

test('allocation: the design example (PTBA 46 / AADI 32 / UNTR 22) warns about PTBA', () => {
  const t = { slug: 'batubara', name: 'Batubara' };
  const a = d.allocation([
    { ticker: 'AADI', capital: 13_440_000, theme: t }, { ticker: 'PTBA', capital: 19_320_000, theme: t }, { ticker: 'UNTR', capital: 9_240_000, theme: t },
  ]);
  assert.strictEqual(a.total, 42_000_000);
  assert.strictEqual(a.count, 3);
  assert.deepStrictEqual(a.slices.emiten.map((s) => [s.label, s.pct]), [['PTBA', 46], ['AADI', 32], ['UNTR', 22]]);
  assert.strictEqual(a.slices.emiten[0].href, '/emiten/PTBA');
  assert.deepStrictEqual(a.slices.tema, [{ label: 'Batubara', pct: 100, href: '/tema/batubara' }]);
  assert.deepStrictEqual(a.slices.tesis, []);
  assert.strictEqual(a.warnings.emiten, 'PTBA 46%: lebih dari 40% portofolio di satu emiten.');
  assert.strictEqual(a.warnings.tema, '100% portofolio di satu tema. Satu kebijakan soal Batubara bisa memengaruhi seluruh portofolio.');
});

test('allocation: no warning at or below 40%, "Tanpa tema" group, empty portfolio', () => {
  const a = d.allocation([
    { ticker: 'AAAA', capital: 40, theme: null }, { ticker: 'BBBB', capital: 35, theme: { slug: 'x', name: 'X' } }, { ticker: 'CCCC', capital: 25, theme: null },
  ]);
  assert.strictEqual(a.warnings.emiten, undefined); // exactly 40 is not "lebih dari 40"
  assert.deepStrictEqual(a.slices.tema.map((s) => [s.label, s.pct]), [['Tanpa tema', 65], ['X', 35]]);
  assert.strictEqual(a.warnings.tema, undefined);
  // every holding without a theme: 100% in "Tanpa tema" is not a theme concentration
  assert.strictEqual(d.allocation([{ ticker: 'AAAA', capital: 10, theme: null }]).warnings.tema, undefined);
  assert.deepStrictEqual(d.allocation([]), { total: 0, count: 0, slices: { emiten: [], tema: [], tesis: [] }, warnings: {} });
});

test('suspensionActions: design copy, id per event, source from the admin when given', () => {
  const [a, b] = d.suspensionActions([
    { ticker: 'UNTR', profile: { trading: { state: 'suspended', since: '2026-11-03', source: 'Pengumuman BEI 3 Nov' } } },
    { ticker: 'PTBA', profile: {} },
  ]);
  assert.strictEqual(a.id, 'suspension-UNTR-2026-11-03');
  assert.deepStrictEqual([a.tone, a.label, a.at, a.href, a.cta], ['red', 'Suspensi', '2026-11-03', '/emiten/UNTR', 'Baca pengumuman']);
  assert.strictEqual(a.title, 'Perdagangan saham UNTR dihentikan sementara');
  assert.strictEqual(a.src, 'Pengumuman BEI 3 Nov');
  assert.strictEqual(b.id, 'suspension-PTBA-na');
  assert.strictEqual(b.at, null);
  assert.strictEqual(b.src, 'Pengumuman Bursa · BEI');
});

const ipo = (listing, schedule) => ({ listingDate: listing, schedule });
const step = (label, start, end) => ({ label, start, end });

test('ipoItems: only listings in the next 14 days, current step as the stage, soonest first', () => {
  const rows = [
    { ticker: 'LATE', name: 'Late', ipo: ipo('2026-11-27', [step('Pencatatan', '2026-11-27', '2026-11-27')]) }, // 15 days
    { ticker: 'PAST', name: 'Past', ipo: ipo('2026-11-11', [step('Pencatatan', '2026-11-11', '2026-11-11')]) }, // yesterday
    { ticker: 'ZZZZ', name: 'Zed', ipo: ipo('2026-11-26', [step('Bookbuilding', '2026-11-10', '2026-11-17'), step('Pencatatan', '2026-11-26', '2026-11-26')]) }, // 14 days
    { ticker: 'ABNU', name: 'Andalan', logoUrl: '/l.svg', ipo: ipo('2026-11-12', [step('Bookbuilding', '2026-11-02', '2026-11-05'), step('Penawaran umum', '2026-11-09', '2026-11-12'), step('Pencatatan', '2026-11-12', '2026-11-12')]) }, // today
    { ticker: 'NODT', name: 'No date', ipo: ipo(null, []) },
    { ticker: 'NOIP', name: 'No ipo', ipo: null },
  ];
  const out = d.ipoItems(rows, NOW);
  assert.deepStrictEqual(out.map((x) => x.ticker), ['ABNU', 'ZZZZ']);
  assert.deepStrictEqual(out[0], { ticker: 'ABNU', name: 'Andalan', logoUrl: '/l.svg', stage: 'Penawaran umum', stageStart: '2026-11-09', stageEnd: '2026-11-12', listingDate: '2026-11-12', daysToListing: 0 });
  assert.strictEqual(out[1].stage, 'Bookbuilding'); // still running (ends 17 Nov)
  assert.strictEqual(out[1].daysToListing, 14);
});

test('schedule: only IPOs the user set a listing reminder for', () => {
  const ipos = [{ ticker: 'ABNU', listingDate: '2026-11-12' }, { ticker: 'ZZZZ', listingDate: '2026-11-20' }];
  assert.deepStrictEqual(d.schedule(ipos, ['ABNU']), [{ kind: 'ipo_listing', ticker: 'ABNU', at: '2026-11-12' }]);
  assert.deepStrictEqual(d.schedule(ipos, []), []);
});
