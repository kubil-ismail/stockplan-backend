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

test('validateCreate needs a 3-letter name and a sector', () => {
  assert.strictEqual(t.validateCreate({ name: 'Ab', sectorSlug: 'energi' }).errors.name, 'Nama tema minimal 3 huruf');
  assert.ok(t.validateCreate({ name: 'Gas bumi' }).errors.sectorSlug);
  const { form, errors } = t.validateCreate({ name: 'Gas bumi', sectorSlug: 'energi' });
  assert.strictEqual(errors, null);
  assert.strictEqual(form.groups.length, 3);
});

test('checks: complete theme passes all five', () => {
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
  assert.deepStrictEqual(t.filterList(rows, {}).tabs, { all: 3, open: 1, draft: 1, review: 1 });
  assert.deepStrictEqual(t.filterList(rows, { sector: 'energi', tab: 'draft' }).rows.map((r) => r.slug), ['gas']);
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
