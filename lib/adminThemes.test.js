'use strict';

const test = require('node:test');
const assert = require('node:assert');
const t = require('./adminThemes');

const theme = (o = {}) => ({ slug: 'batubara', name: 'Batubara', description: 'Perusahaan batu bara.', drivers: [], groups: null, status: 'published', publishedAt: new Date(), sector: { slug: 'energi', name: 'Energi' }, ...o });
const stages = () => [
  { order: 2, groupKey: 'tengah', name: 'Logistik', description: 'Angkut.', tickers: ['TCPI', 'AADI'], shares: { TCPI: { pct: 81, source: 'LK 2025' } } },
  { order: 1, groupKey: 'hulu', name: 'Pemilik tambang', description: 'Gali.', tickers: ['BUMI', 'AADI'], shares: { BUMI: { pct: 100, source: 'LK 2025' }, AADI: { pct: 72, source: 'LK 2025' } } },
];
const complete = () => {
  const f = t.columnsToForm(theme({ drivers: ['Harga batu bara'] }), stages());
  f.groups.forEach((g) => { g.description = 'Deskripsi.'; });
  f.stages[1].rows[1].pct = 28;
  f.stages[1].rows[1].source = 'LK 2025';
  f.sectorMap = { subsectorId: '0b6c2f2e-1d6a-4b47-9a7e-3f1c2d4e5f60', icon: 'flame', dataStatus: 'ready', updateNote: '' };
  return f;
};
const allReady = { BUMI: true, AADI: true, TCPI: true };

test('columnsToForm orders stages, fills default groups and shares', () => {
  const f = t.columnsToForm(theme(), stages());
  assert.deepStrictEqual(f.stages.map((s) => s.name), ['Pemilik tambang', 'Logistik']);
  assert.deepStrictEqual(f.groups.map((g) => g.key), ['hulu', 'tengah']); // only groups in use
  assert.deepStrictEqual(f.stages[1].rows[1], { ticker: 'AADI', pct: null, source: '' });
  assert.strictEqual(t.validateForm(f).errors, null);
});

test('formToColumns renumbers stages and keeps shares per ticker', () => {
  const { stages: rows } = t.formToColumns(complete());
  assert.deepStrictEqual(rows.map((s) => s.order), [1, 2]);
  assert.deepStrictEqual(rows[1].tickers, ['TCPI', 'AADI']);
  assert.deepStrictEqual(rows[1].shares.AADI, { pct: 28, source: 'LK 2025' });
});

test('validateForm: bad ticker, duplicate ticker in a stage, duplicate group key, unknown section', () => {
  const { errors, values } = t.validateForm({
    stages: [{ name: 'a', groupKey: 'hulu', description: 'b', rows: [{ ticker: 'bumi', pct: 10, source: '' }, { ticker: 'BUMI', pct: 5, source: '' }, { ticker: 'X1', pct: null, source: '' }] }],
    groups: [{ key: 'g1', title: 'A', description: '', icon: 'mine', color: 'amber' }, { key: 'g1', title: 'B', description: '', icon: 'mine', color: 'blue' }],
    foo: 1,
  });
  assert.strictEqual(values.stages[0].rows[0].ticker, 'BUMI');
  assert.ok(errors['stages[0].rows[1].ticker'] && errors['stages[0].rows[2].ticker'] && errors['groups[1].key'] && errors.foo);
});

test('validateCreate needs a 3-letter name, a sector and a subsector', () => {
  assert.strictEqual(t.validateCreate({ name: 'Ab', sectorSlug: 'energi' }).errors.name, 'Nama tema minimal 3 huruf');
  assert.ok(t.validateCreate({ name: 'Gas bumi' }).errors.sectorSlug);
  assert.strictEqual(t.validateCreate({ name: 'Gas bumi', sectorSlug: 'energi' }).errors['sectorMap.subsectorId'], 'Pilih sub-sektor.');
  const { form, errors } = t.validateCreate({ name: 'Gas bumi', sectorSlug: 'energi', sectorMap: { subsectorId: '0b6c2f2e-1d6a-4b47-9a7e-3f1c2d4e5f60' } });
  assert.strictEqual(errors, null);
  assert.strictEqual(form.groups.length, 3);
});

test('checks: complete theme passes all six (5 + sector map)', () => {
  const c = t.checks(complete(), allReady);
  assert.ok(c.every((x) => x.ok), JSON.stringify(c.filter((x) => !x.ok)));
});

test('checks: totals over 100%, empty shares, readiness below 80%', () => {
  const f = complete();
  f.stages[0].rows[1].pct = 80; // AADI 80 + 28
  f.stages[1].rows[0].source = '';
  const c = Object.fromEntries(t.checks(f, { BUMI: true }).map((x) => [x.key, x]));
  assert.strictEqual(c.totals.note, 'AADI');
  assert.strictEqual(c.shares.note, '1 sumber kosong');
  assert.strictEqual(c.readiness.note, '33%');
  assert.strictEqual(t.multiStage(f)[0].note, 'Lebih 8%');
});

test('multiStage notes the remainder outside the theme', () => {
  const f = complete();
  f.stages[0].rows[1].pct = 50;
  assert.strictEqual(t.multiStage(f)[0].note, 'OK · sisanya di luar tema');
});

test('slugify strips accents and symbols', () => {
  assert.strictEqual(t.slugify('Nikel & baterai EV'), 'nikel-baterai-ev');
  assert.strictEqual(t.slugify('Minyak sawit (CPO)'), 'minyak-sawit-cpo');
  assert.strictEqual(t.slugify('Énergi'), 'energi');
});

test('list: status keys, tabs follow filters, chain colors', () => {
  const f = complete();
  const rows = [
    t.listRow(theme(), f, allReady),
    t.listRow(theme({ slug: 'gas', name: 'Gas bumi', status: 'draft' }), { ...f, name: 'Gas bumi' }, {}),
    t.listRow(theme({ slug: 'bank', name: 'Perbankan', status: 'review', sector: { slug: 'keuangan', name: 'Keuangan' } }), { ...f, name: 'Perbankan' }, {}),
  ];
  assert.deepStrictEqual(rows.map((r) => r.status), ['open', 'draft', 'review']);
  assert.deepStrictEqual(rows[0].chain.map((c) => c.color), ['amber', 'blue']);
  assert.strictEqual(rows[0].readiness.percent, 100);
  assert.deepStrictEqual(t.filterList(rows, {}).tabs, { all: 3, open: 1, map: 0, draft: 1, review: 1 });
  assert.deepStrictEqual(t.filterList(rows, { sector: 'energi', tab: 'draft' }).rows.map((r) => r.slug), ['gas']);
});

test('list: published theme with a pending draft counts once, as draft', () => {
  const f = complete();
  const rows = [
    t.listRow(theme(), f, allReady), // published, no draft
    t.listRow(theme({ slug: 'gas', status: 'draft', draft: { name: 'Gas' } }), f, allReady), // published, newer draft pending
    t.listRow(theme({ slug: 'nikel', status: 'draft', publishedAt: null, draft: { name: 'Nikel' } }), f, allReady), // never published
  ];
  const count = (s) => rows.filter((r) => r.status === s).length; // same rule as summary in adminThemeController.index
  assert.strictEqual(count('open'), 1);
  assert.strictEqual(count('draft'), 2);
  assert.strictEqual(count('open') + count('draft') + count('review'), rows.length);
  assert.deepStrictEqual(t.filterList(rows, {}).tabs, { all: 3, open: 1, map: 0, draft: 2, review: 0 });
});

const SUB = '0b6c2f2e-1d6a-4b47-9a7e-3f1c2d4e5f60';

test('sectorMap: validated, round-trips through columns, missing in old drafts is filled from columns', () => {
  assert.strictEqual(t.validateForm({ sectorMap: { subsectorId: SUB, icon: 'flame', dataStatus: 'ready', updateNote: 'Q3' } }).errors, null);
  const bad = t.validateForm({ sectorMap: { subsectorId: 'x', icon: 'mine', dataStatus: 'maybe' } }).errors;
  assert.deepStrictEqual(Object.keys(bad).sort(), ['sectorMap.dataStatus', 'sectorMap.icon', 'sectorMap.subsectorId']); // 'mine' is a main-group icon
  const th = theme({ subsectorId: SUB, icon: 'flame', dataStatus: 'ready', updateNote: 'Q3', stages: stages() });
  const cols = t.formToColumns(t.columnsToForm(th, th.stages)).theme;
  assert.deepStrictEqual([cols.subsectorId, cols.icon, cols.dataStatus, cols.updateNote], [SUB, 'flame', 'ready', 'Q3']);
  const f = t.formOf({ ...th, draft: { name: 'Batubara baru' } }); // draft saved before sectorMap existed
  assert.strictEqual(f.name, 'Batubara baru');
  assert.deepStrictEqual(f.sectorMap, { subsectorId: SUB, icon: 'flame', dataStatus: 'ready', updateNote: 'Q3' });
});

test('dataUpdatedAt: stamped when the row turns ready or its note changes', () => {
  const at = new Date('2026-11-01');
  const now = new Date('2026-11-12');
  const m = (dataStatus, updateNote = '') => ({ sectorMap: { subsectorId: SUB, icon: 'flame', dataStatus, updateNote } });
  assert.strictEqual(t.dataUpdatedAt(m('soon'), m('ready'), null, now), now);
  assert.strictEqual(t.dataUpdatedAt(m('ready', 'Q2'), m('ready', 'Q3'), at, now), now);
  assert.strictEqual(t.dataUpdatedAt(m('ready', 'Q3'), m('ready', 'Q3'), at, now), at);
  assert.strictEqual(t.dataUpdatedAt(m('ready'), m('soon'), at, now), at);
});

test('map-only rows: own checks, status "map", no readiness, tabs still add up', () => {
  const map = { ...t.emptyForm(), name: 'Minyak & Gas', sectorSlug: 'energi' };
  const placeholder = theme({ slug: 'migas', status: 'draft', publishedAt: null });
  assert.ok(t.isMapOnly(placeholder, map));
  assert.ok(!t.isMapOnly(theme(), map)); // a published chain can't drop its stages through the map-only path
  assert.deepStrictEqual(t.checks(map, {}, { mapOnly: true }).map((c) => [c.key, c.ok]), [['identity', true], ['sectorMap', false]]);
  map.sectorMap = { subsectorId: SUB, icon: 'droplet', dataStatus: 'soon', updateNote: '' };
  assert.ok(t.checks(map, {}, { mapOnly: true }).every((c) => c.ok));
  const f = complete();
  assert.strictEqual(t.checks(f, allReady).length, 6); // a chain is also a sector page row
  const noIcon = t.checks({ ...f, sectorMap: { ...map.sectorMap, icon: '' } }, allReady).find((c) => c.key === 'sectorMap');
  assert.deepStrictEqual([noIcon.ok, noIcon.note], [false, 'Pilih ikon']);

  const rows = [
    t.listRow(theme(), f, allReady),
    t.listRow(theme({ slug: 'migas', status: 'published', publishedAt: null }), map, {}), // published to the sector map
    t.listRow(placeholder, map, {}), // new map row, not yet published
  ];
  assert.deepStrictEqual(rows.map((r) => [r.status, r.kind]), [['open', 'chain'], ['map', 'map'], ['draft', 'map']]);
  assert.strictEqual(rows[1].readiness, null);
  const { tabs } = t.filterList(rows, {});
  assert.deepStrictEqual(tabs, { all: 3, open: 1, map: 1, draft: 1, review: 0 });
  assert.strictEqual(tabs.open + tabs.map + tabs.draft + tabs.review, tabs.all);
});

test('listRow: dataStatus follows the published columns (soon / ready / new), as customers see it', () => {
  const f = complete();
  const day = 24 * 60 * 60 * 1000;
  const at = (ago) => new Date(Date.now() - ago * day);
  const row = (o) => t.listRow(theme(o), f, allReady).dataStatus;
  assert.deepStrictEqual(row({ dataStatus: 'soon', dataUpdatedAt: at(1) }), { key: 'soon', label: 'Segera hadir', updatedAt: null });
  assert.deepStrictEqual(row({ dataStatus: 'ready', dataUpdatedAt: at(1) }).key, 'new');
  assert.strictEqual(row({ dataStatus: 'ready', dataUpdatedAt: at(1) }).label, 'Baru');
  assert.deepStrictEqual(row({ dataStatus: 'ready', dataUpdatedAt: at(30) }).key, 'ok');
  assert.strictEqual(row({ dataStatus: 'ready', dataUpdatedAt: null }).updatedAt, null);
});

test('unmappedQueue puts IPO first, then market cap', () => {
  const cos = [
    { ticker: 'AAAA', name: 'A', marketCap: '10', status: 'listed' },
    { ticker: 'BBBB', name: 'B', marketCap: '99', status: 'listed' },
    { ticker: 'IPOO', name: 'I', marketCap: null, status: 'ipo' },
    { ticker: 'MAPD', name: 'M', marketCap: '500', status: 'listed' },
  ];
  const q = t.unmappedQueue(cos, new Set(['MAPD']), (c) => (c.ticker === 'BBBB' ? { slug: 'x', name: 'X', via: 'sektor' } : null), 2);
  assert.strictEqual(q.total, 3);
  assert.deepStrictEqual(q.items.map((i) => i.ticker), ['IPOO', 'BBBB']);
  assert.strictEqual(q.items[1].note, 'Usulan sistem dari sektor: X');
});
