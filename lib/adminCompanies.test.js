'use strict';

const test = require('node:test');
const assert = require('node:assert');
const a = require('./adminCompanies');

const listed = () => ({
  ticker: 'BUMI', name: 'Bumi Resources Tbk', status: 'listed', sector: { slug: 'energi', name: 'Energi' }, industry: { name: 'Batu bara' },
  marketCap: '44900000000000', metrics: { pbv: 1.5, roePct: 7, grossMarginPct: 17, debtToAssetPct: 36 }, priceDate: '2026-10-29', financialPeriod: 'H1-2026',
  groupName: 'Grup Bakrie', summary: 'Produsen batu bara termal terbesar di Indonesia.',
  profile: {
    overview: 'BUMI adalah induk tambang batu bara.', overviewSource: 'Laporan Tahunan 2025',
    strengths: ['Skala besar'], weaknesses: ['ROE kecil'], watchItems: ['Harga batu bara'],
    financials: { source: 'XBRL BEI', periods: [{ label: '2025', span: 'setahun' }, { label: 'H1-2026', span: '6 bulan' }],
      revenue: { values: [24.1e12, 15.5e12], note: 'a' }, netIncome: { values: [1.4e12, 1.1e12], note: 'b' }, grossMarginPct: { values: [17, 17], note: 'c' } },
    revenueSources: [{ name: 'Ekspor', pct: 52, source: 'LK 2025' }, { name: 'Domestik', pct: 48, source: 'LK 2025' }],
    subsidiaries: [{ name: 'KPC', business: 'Tambang', ownershipPct: 50.99 }],
    shareholders: { items: [{ name: 'Mach Energy', pct: 45.78 }, { name: 'Publik', pct: 54.22, public: true }], note: 'x' },
    management: { total: 12, people: [{ name: '[Nama]', role: 'Presiden Direktur' }] },
    risks: [{ title: 'Harga', description: 'Siklikal', level: 'high' }],
    news: [{ title: 'Target 2026', source: 'LK', dateLabel: '30 Mar 2026' }],
  },
});

test('validateForm rejects unknown sections and bad values, keeps good ones', () => {
  const { values, errors } = a.validateForm({ name: ' X ', foo: 1, risks: [{ title: 'a', description: 'b', level: 'zzz' }], keyNumbers: { pbv: 'x' } });
  assert.strictEqual(values.name, 'X');
  assert.ok(errors.foo && errors['risks[0].level'] && errors['keyNumbers.pbv']);
  assert.strictEqual(a.validateForm({ name: 'ok', ipo: null }).errors, null);
});

test('form <-> columns round trip keeps a complete company publishable', () => {
  const row = listed();
  const form = a.columnsToForm(row);
  assert.strictEqual(a.validateForm(form).errors, null);
  assert.strictEqual(form.shareholders.items.length, 1); // free float is derived, not edited
  assert.ok(a.sections(form).every((s) => s.ok), JSON.stringify(a.sections(form).filter((s) => !s.ok)));
  const attrs = a.formToColumns(form, row);
  assert.strictEqual(attrs.profile.shareholders.items.at(-1).pct, 54.22); // 100 - 45.78
  assert.strictEqual(attrs.profile.financials.source, 'XBRL BEI'); // untouched keys preserved
  assert.strictEqual(attrs.profile.management.total, 12);
});

test('sections block on revenue total and length limits', () => {
  const f = a.columnsToForm(listed());
  f.revenueSources[1].pct = 40;
  f.points.strengths = ['x'.repeat(61)];
  const bad = a.sections(f).filter((s) => !s.ok).map((s) => s.key);
  assert.deepStrictEqual(bad.sort(), ['points', 'revenue']);
  assert.strictEqual(a.sections(f).find((s) => s.key === 'revenue').note, 'kurang 8%');
});

test('suspended trading state needs since + source + reason and maps to status', () => {
  const row = listed();
  const f = a.columnsToForm(row);
  f.trading = { state: 'suspended', since: null, source: '', reason: '' };
  assert.ok(!a.sections(f).find((s) => s.key === 'identity').ok);
  f.trading = { state: 'suspended', since: '2026-11-01', source: 'Pengumuman BEI', reason: 'UMA' };
  assert.ok(a.sections(f).find((s) => s.key === 'identity').ok);
  assert.strictEqual(a.formToColumns(f, row).status, 'suspended');
});

test('IPO: schedule order, price range, proceeds and customer-shape mapping', () => {
  const f = a.emptyForm(true);
  assert.strictEqual(a.scheduleError({ ...f.ipo.schedule, bookbuildingStart: '2026-10-20', bookbuildingEnd: '2026-10-10' }), 'Tanggal akhir bookbuilding tidak boleh sebelum mulai bookbuilding.');
  assert.match(a.priceError({ priceLow: 420, priceHigh: 480, priceFinal: 500 }), /di luar rentang/);
  Object.assign(f, { name: 'PT Andalan', subsector: 'Nikel', summary: { short: 'Pendek.', overview: 'Panjang.', source: '' } });
  Object.assign(f.ipo, { schedule: { ...f.ipo.schedule, listing: '2026-11-12' }, priceLow: 420, priceHigh: 480, priceFinal: 450, sharesOffered: 2.5e9, publicPct: 20, underwriters: ['PT A'], useOfProceeds: [{ label: 'Smelter', pct: 65 }, { label: 'Modal kerja', pct: 35 }] });
  assert.ok(a.sections(f, true).every((s) => s.ok));
  const ipo = a.formToIpo(f.ipo, { lockupNote: 'keep' });
  assert.strictEqual(ipo.proceeds, 1125e9);
  assert.strictEqual(ipo.sharesTotal, 12.5e9);
  assert.strictEqual(ipo.useOfProceeds[0].amount, Math.round(1125e9 * 0.65));
  assert.strictEqual(ipo.lockupNote, 'keep');
  assert.deepStrictEqual(a.ipoToForm(ipo, 'Utama').schedule.listing, '2026-11-12');
});

test('validateCreate needs a 4-letter ticker and a name', () => {
  assert.strictEqual(a.validateCreate({ ticker: 'abnu', name: 'PT A' }).ticker, 'ABNU');
  assert.strictEqual(a.validateCreate({ name: 'PT A' }).errors.ticker, 'Kode saham wajib diisi.');
  assert.strictEqual(a.validateCreate({ ticker: 'AB1', name: 'PT A' }).errors.ticker, 'Kode saham harus 4 huruf.');
  assert.ok(a.validateCreate({ ticker: 'ABNU', name: '  ' }).errors.name);
});

test('list: status, tabs follow filters, CSV escapes and blocks formulas', () => {
  const row = (o) => ({ ...listed(), publishStatus: 'published', updatedAt: new Date('2026-11-04'), ...o });
  const items = [
    a.listItem(row({ ticker: 'AAAA', name: 'Alpha' }), { name: 'Batubara', stageCount: 2 }),
    a.listItem(row({ ticker: 'BBBB', name: '=cmd, "Beta"', publishStatus: 'review' }), undefined),
    a.listItem(row({ ticker: 'CCCC', name: 'Gamma', status: 'ipo', publishStatus: 'draft' }), undefined),
  ];
  assert.deepStrictEqual(items.map((i) => i.status), ['ok', 'review', 'new']);
  assert.strictEqual(items[0].theme, 'Batubara · 2 tahap');
  assert.strictEqual(items[1].theme, 'Belum dipetakan');
  const all = a.filterList(items, {});
  assert.deepStrictEqual(all.tabs, { all: 3, review: 1, incomplete: 2, ready: 1 });
  assert.strictEqual(a.filterList(items, { q: 'alp', tab: 'ready' }).rows.length, 1);
  assert.strictEqual(a.filterList(items, { q: 'alp' }).tabs.all, 1);
  const csv = a.toCsv(items);
  assert.match(csv, /"'=cmd, ""Beta"""/);
  assert.ok(csv.startsWith('Kode,Nama,Sektor'));
});

test('columnsToForm subsector: saved choice, else the industry\'s sub-sektor, else the industry name', () => {
  const row = (profile, industry) => ({ ...listed(), profile: { ...listed().profile, subsector: profile }, industry });
  assert.strictEqual(a.columnsToForm(row('Energi Alternatif', { name: 'Batu bara', subsector: { name: 'Minyak, Gas & Batu Bara' } })).subsector, 'Energi Alternatif');
  assert.strictEqual(a.columnsToForm(row(undefined, { name: 'Batu bara', subsector: { name: 'Minyak, Gas & Batu Bara' } })).subsector, 'Minyak, Gas & Batu Bara');
  assert.strictEqual(a.columnsToForm(row(undefined, { name: 'Batu bara' })).subsector, 'Batu bara');
  assert.strictEqual(a.columnsToForm(row(undefined, null)).subsector, '');
});
