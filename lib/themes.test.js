'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { companyOrder, themeView, themesByTicker, clientVisible } = require('./themes');

const stages = [
  { order: 2, groupKey: 'hulu', name: 'Pemilik tambang', shortName: 'Pemilik', description: 'd2', tickers: ['BUMI', 'ABMM', 'GONE'] },
  { order: 1, groupKey: 'hulu', name: 'Kontraktor', shortName: null, description: 'd1', tickers: ['UNTR', 'ABMM'] },
];
const companies = [
  { ticker: 'BUMI', name: 'Bumi', status: 'listed', marketCap: '44900000000000', priceDate: '2026-10-29', profile: {} },
  { ticker: 'UNTR', name: 'United Tractors', status: 'listed', marketCap: null, priceDate: null, profile: { highlights: { insight: 'x' } } },
  { ticker: 'ABMM', name: 'ABM', status: 'listed', marketCap: '1000', priceDate: '2026-10-16', tagline: 'Terintegrasi', profile: {} },
];

test('companyOrder: first appearance by stage order', () => {
  assert.deepStrictEqual(companyOrder(stages), ['UNTR', 'ABMM', 'BUMI', 'GONE']);
});

test('themeView: drops unknown tickers, latest priced date, viewer limited to theme', () => {
  const v = themeView({ slug: 'batubara', name: 'Batubara', sector: { slug: 'energi', name: 'Energi' } }, stages, companies, ['BUMI', 'BBRI']);
  assert.deepStrictEqual(v.stages.map((s) => s.order), [1, 2]);
  assert.deepStrictEqual(v.stages[1].tickers, ['BUMI', 'ABMM']);
  assert.deepStrictEqual(v.companies.map((c) => c.ticker), ['UNTR', 'ABMM', 'BUMI']);
  assert.strictEqual(v.companies[2].marketCap, 44.9e12);
  assert.deepStrictEqual(v.companies[0].highlights, { insight: 'x' });
  assert.strictEqual(v.mcapAsOf, '2026-10-29');
  assert.deepStrictEqual(v.viewer.watchlist, ['BUMI']);
  assert.deepStrictEqual(v.theme.sector, { slug: 'energi', name: 'Energi' });
});

test('themesByTicker: one entry per theme, empty list for no theme', () => {
  const t = { slug: 'batubara', name: 'Batubara' };
  const r = themesByTicker(stages.map((s) => ({ ...s, theme: t })), ['ABMM', 'BBRI']);
  assert.deepStrictEqual(r, { ABMM: [t], BBRI: [] });
});

test('clientVisible hides draft industries, keeps the other conditions', () => {
  const { Op } = require('sequelize');
  assert.deepStrictEqual(clientVisible({ slug: 'x' }), { slug: 'x', status: { [Op.ne]: 'draft' } });
});
