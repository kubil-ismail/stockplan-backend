'use strict';

const test = require('node:test');
const assert = require('node:assert');
const s = require('./sectors');

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-11-10T12:00:00Z');
const ago = (d) => new Date(now - d * DAY);

test('industryStatus: soon / new within 7 days / ok', () => {
  assert.strictEqual(s.industryStatus({ dataStatus: 'soon', dataUpdatedAt: ago(1) }, now), 'soon');
  assert.strictEqual(s.industryStatus({ dataStatus: 'ready', dataUpdatedAt: ago(7) }, now), 'new');
  assert.strictEqual(s.industryStatus({ dataStatus: 'ready', dataUpdatedAt: ago(8) }, now), 'ok');
  assert.strictEqual(s.industryStatus({ dataStatus: 'ready', dataUpdatedAt: null }, now), 'ok');
});

test('sectorStatus', () => {
  assert.strictEqual(s.sectorStatus([]), 'soon');
  assert.strictEqual(s.sectorStatus(['soon', 'soon']), 'soon');
  assert.strictEqual(s.sectorStatus(['soon', 'ok']), 'ok');
  assert.strictEqual(s.sectorStatus(['ok', 'new', 'soon']), 'new');
});

const sector = {
  slug: 'energi', name: 'Energi', icon: 'bolt',
  subsectors: [
    { name: 'A', industries: [
      { slug: 'bb', name: 'Batu Bara', dataStatus: 'ready', dataUpdatedAt: ago(1), updateNote: 'diperbarui Q3' },
      { slug: 'mg', name: 'Minyak & Gas', dataStatus: 'soon', dataUpdatedAt: ago(1), updateNote: 'ignored' },
    ] },
    { name: 'B', industries: [{ slug: 'jp', name: 'Jasa', dataStatus: 'ready', dataUpdatedAt: ago(30) }] },
  ],
};

test('sectorView counts, status, updatedAt ignores "soon" industries', () => {
  const v = s.sectorView(sector, now);
  assert.strictEqual(v.status, 'new');
  assert.strictEqual(v.subsectorCount, 2);
  assert.strictEqual(v.industryCount, 3);
  assert.deepStrictEqual(v.updatedAt, ago(1));
  assert.deepStrictEqual(v.subsectors[0].industries.map((i) => i.status), ['new', 'soon']);
  assert.strictEqual(v.subsectors[0].industries[1].updatedAt, null);
});

test('sectorNotice picks newest "Baru" industry with a note', () => {
  assert.deepStrictEqual(s.sectorNotice(sector, now), { industrySlug: 'bb', industryName: 'Batu Bara', note: 'diperbarui Q3', updatedAt: ago(1) });
  assert.strictEqual(s.sectorNotice(sector, now + 30 * DAY), null);
});


test('themeCard + sectorView: published themes listed under their sector', () => {
  const card = s.themeCard({ sectorId: 's1', slug: 'nikel', name: 'Nikel', description: null, stages: [{ tickers: ['INCO', 'ANTM'] }, { tickers: ['ANTM'] }] });
  assert.deepStrictEqual(card, { sectorId: 's1', slug: 'nikel', name: 'Nikel', description: null, stageCount: 2, emitenCount: 2 });
  const v = s.sectorView({ id: 's1', slug: 'barang-baku', name: 'Barang Baku', icon: 'cube', subsectors: [] }, Date.now(), [], [card, { ...card, sectorId: 's2', slug: 'x' }]);
  assert.deepStrictEqual(v.themes, [{ slug: 'nikel', name: 'Nikel', description: null, stageCount: 2, emitenCount: 2 }]);
  assert.strictEqual(v.status, 'soon'); // sector status follows its industries only; a published theme card doesn't open it
});

// ---- sector-page rows come from theme_themes ----
const cos = [
  { ticker: 'BUMI', logoUrl: null, marketCap: '10', sectorId: 's1', industryId: 'i-bb' },
  { ticker: 'PTBA', logoUrl: null, marketCap: '30', sectorId: 's1', industryId: 'i-bb' },
  { ticker: 'UNTR', logoUrl: null, marketCap: '50', sectorId: 's1', industryId: 'i-jp' },
];
const row = (o) => ({ id: `i-${o.slug}`, subsectorId: 'sub-a', icon: 'flame', position: 0, dataStatus: 'soon', dataUpdatedAt: null, updateNote: null, publishedAt: null, stages: [], ...o });
const energi = {
  id: 's1', slug: 'energi', name: 'Energi', icon: 'bolt',
  subsectors: [{ id: 'sub-a', name: 'Minyak, Gas & Batu Bara' }, { id: 'sub-b', name: 'Energi Alternatif' }],
};
const rows = [
  row({ slug: 'jasa', name: 'Jasa', position: 2, id: 'i-jp', dataStatus: 'ready', dataUpdatedAt: ago(30) }), // ready, no chain
  row({ slug: 'batubara', name: 'Batubara', position: 0, id: 'i-bb', stages: [{ tickers: ['BUMI', 'UNTR'] }], dataStatus: 'ready', dataUpdatedAt: ago(1), updateNote: 'diperbarui Q3', publishedAt: ago(10) }),
  row({ slug: 'migas', name: 'Minyak & Gas', position: 1 }), // "Segera hadir" placeholder
  row({ slug: 'surya', name: 'Surya', subsectorId: 'sub-b', publishedAt: ago(5), stages: [{ tickers: ['UNTR', 'XXXX'] }, { tickers: ['UNTR'] }] }),
  row({ slug: 'lain', name: 'Lain', subsectorId: 'sub-other' }), // another sector's subsector
];

test('withRows: rows grouped by subsector, ordered by position then name', () => {
  const tree = s.withRows(energi, rows);
  assert.deepStrictEqual(tree.subsectors.map((x) => x.industries.map((i) => i.slug)), [['batubara', 'migas', 'jasa'], ['surya']]);
});

test('sectorView from theme rows: status, "Lihat" only for published chains, emiten source', () => {
  const v = s.sectorView(s.withRows(energi, rows), now, cos);
  const [bb, mg, jp] = v.subsectors[0].industries;
  const [su] = v.subsectors[1].industries;
  assert.deepStrictEqual([bb.status, mg.status, jp.status, su.status], ['new', 'soon', 'ok', 'soon']); // su: published chain but dataStatus soon
  assert.deepStrictEqual([bb.themeSlug, mg.themeSlug, jp.themeSlug, su.themeSlug], ['batubara', null, null, 'surya']);
  assert.deepStrictEqual(bb.leaders.map((l) => l.ticker), ['UNTR', 'PTBA', 'BUMI']); // classified (PTBA, BUMI) + in its chain (UNTR), once each
  assert.strictEqual(bb.emitenCount, 3);
  assert.strictEqual(jp.emitenCount, 1);
  assert.strictEqual(mg.emitenCount, 0);
  assert.strictEqual(su.emitenCount, 1); // nothing classified: distinct listed tickers in its stages
  assert.strictEqual(v.industryCount, 4);
  assert.strictEqual(v.status, 'new');
  assert.deepStrictEqual(v.updatedAt, ago(1));
});

test('published chain follows dataStatus: soon stays soon, sector icon as fallback, sector still open', () => {
  const v = s.sectorView(s.withRows(energi, [row({ slug: 'bb', name: 'Batu bara', icon: null, publishedAt: ago(1), stages: [{ tickers: ['BUMI'] }] })]), now, cos,
    [{ sectorId: 's1', slug: 'bb', name: 'Batu bara', description: null, stageCount: 1, emitenCount: 1 }]);
  const [bb] = v.subsectors[0].industries;
  assert.deepStrictEqual([bb.status, bb.icon, bb.themeSlug, bb.updatedAt], ['soon', 'bolt', 'bb', null]);
  assert.strictEqual(v.status, 'soon'); // every industry soon → sector soon, even with a published theme
});

test('sectorNotice from theme rows: newest "Baru" row with a note', () => {
  const tree = s.withRows(energi, rows);
  assert.deepStrictEqual(s.sectorNotice(tree, now), { industrySlug: 'batubara', industryName: 'Batubara', note: 'diperbarui Q3', updatedAt: ago(1) });
  assert.strictEqual(s.sectorNotice(tree, now + 7 * DAY), null);
});

test('sector is "Segera hadir" while every industry is soon; a theme without subsector is only a card', () => {
  assert.strictEqual(s.sectorView(s.withRows(energi, [row({ slug: 'migas', name: 'Minyak & Gas' })]), now, cos).status, 'soon');
  const v = s.sectorView(s.withRows(energi, [row({ slug: 'migas', name: 'Minyak & Gas' })]), now, cos,
    [{ sectorId: 's1', slug: 'nikel', name: 'Nikel', description: null, stageCount: 2, emitenCount: 2 }]);
  assert.strictEqual(v.status, 'soon');
  assert.strictEqual(v.industryCount, 1);
  assert.deepStrictEqual(v.themes.map((t) => t.slug), ['nikel']);
  assert.ok(!v.subsectors.some((sub) => sub.industries.some((i) => i.slug === 'nikel')));
});
