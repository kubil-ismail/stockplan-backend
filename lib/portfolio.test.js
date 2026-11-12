'use strict';

const test = require('node:test');
const assert = require('node:assert');
const p = require('./portfolio');

test('capital = lots × 100 × average price (the client fixture)', () => {
  assert.strictEqual(p.capital({ lots: 60, avgPrice: 2400 }), 14_400_000);
  assert.strictEqual(p.capital({ lots: 12, avgPrice: 8000 }), 9_600_000);
});

test('afterTrade: buy re-weights the average, sell keeps it, selling all closes', () => {
  assert.deepStrictEqual(p.afterTrade({ lots: 60, avgPrice: 2400 }, 'buy', 40, 2600), { lots: 100, avgPrice: 2480 });
  assert.deepStrictEqual(p.afterTrade({ lots: 10, avgPrice: 2800 }, 'buy', 1, 3000), { lots: 11, avgPrice: 2818 }); // 2818.18 rounds
  assert.deepStrictEqual(p.afterTrade({ lots: 60, avgPrice: 2400 }, 'sell', 20, 9999), { lots: 40, avgPrice: 2400 });
  assert.strictEqual(p.afterTrade({ lots: 5, avgPrice: 100 }, 'sell', 5, 100).lots, 0);
});

test('cashAfter / cashError', () => {
  assert.strictEqual(p.cashAfter(1000, 'buy', 300, true), 700);
  assert.strictEqual(p.cashAfter(1000, 'sell', 300, true), 1300);
  assert.strictEqual(p.cashAfter(1000, 'buy', 300, false), 1000);
  assert.strictEqual(p.cashError(8_570_000, 9_600_000), 'Dana tunai tidak cukup (sisa Rp8,6 jt).');
  assert.strictEqual(p.cashError(1000, 1000), null);
});

test('rupiah formats like the client', () => {
  assert.strictEqual(p.rupiah(2400), 'Rp2.400');
  assert.strictEqual(p.rupiah(14_400_000), 'Rp14.400.000');
  assert.strictEqual(p.rupiahShort(8_570_000), 'Rp8,6 jt');
  assert.strictEqual(p.rupiahShort(12_400_000_000_000), 'Rp12,4 T');
  assert.strictEqual(p.rupiahShort(2_500_000_000), 'Rp2,5 M');
  assert.strictEqual(p.rupiahShort(950_000), 'Rp950.000');
});

test('validateAdd: design messages, ticker normalised, useCash opt-in', () => {
  assert.deepStrictEqual(p.validateAdd({ ticker: ' bbri ', lots: 10, avgPrice: 4500 }).values, { ticker: 'BBRI', lots: 10, avgPrice: 4500, useCash: false });
  assert.strictEqual(p.validateAdd({ ticker: 'BBRI', lots: 10, avgPrice: 4500, useCash: true }).values.useCash, true);
  assert.strictEqual(p.validateAdd({ lots: 10, avgPrice: 4500 }).errors.ticker, 'Pilih emitennya dulu.');
  for (const bad of [{ lots: 0, avgPrice: 1 }, { lots: 1, avgPrice: 0 }, { lots: 1.5, avgPrice: 1 }, { lots: '10', avgPrice: 1 }, { lots: -1, avgPrice: 5 }, {}]) {
    assert.strictEqual(p.validateAdd({ ticker: 'BBRI', ...bad }).errors.lots, 'Isi jumlah lot dan harga beli.');
  }
  assert.strictEqual(p.validateAdd({ ticker: 'BBRI', lots: p.LIMITS.lots + 1, avgPrice: 1 }).errors.lots, p.MSG.tooBig);
  assert.strictEqual(p.validateAdd({ ticker: 'BBRI', lots: 1, avgPrice: 1, useCash: 'yes' }).errors.useCash, p.MSG.body);
  assert.ok(p.validateAdd(null).errors.ticker);
});

test('validateTrade: side required, trade wording', () => {
  assert.strictEqual(p.validateTrade({ ticker: 'PTBA', side: 'buy', lots: 5, price: 2500 }).errors, null);
  assert.strictEqual(p.validateTrade({ ticker: 'PTBA', side: 'hold', lots: 5, price: 2500 }).errors.side, 'Pilih beli atau jual.');
  assert.strictEqual(p.validateTrade({ ticker: 'PTBA', side: 'sell', lots: 5 }).errors.lots, 'Isi jumlah lot dan harga.');
});

test('validateEdit: partial, positive, at least one field', () => {
  assert.deepStrictEqual(p.validateEdit({ lots: 70 }).values, { lots: 70 });
  assert.deepStrictEqual(p.validateEdit({ lots: 70, avgPrice: 2500 }).values, { lots: 70, avgPrice: 2500 });
  assert.strictEqual(p.validateEdit({ lots: 0 }).errors.lots, 'Lot dan harga beli harus lebih dari 0.');
  assert.strictEqual(p.validateEdit({}).errors.form, p.MSG.nothing);
});

test('validateCash: integer ≥ 0', () => {
  assert.strictEqual(p.validateCash({ amount: 0 }).errors, null);
  assert.strictEqual(p.validateCash({ amount: 8_570_000 }).amount, 8_570_000);
  for (const bad of [{ amount: -1 }, { amount: 1.5 }, { amount: '5' }, {}, null, { amount: p.LIMITS.cash + 1 }]) assert.ok(p.validateCash(bad).errors.amount);
});

test('log sentences match the client; an unchanged capital logs nothing', () => {
  assert.deepStrictEqual(p.logAdd({ ticker: 'BBRI', lots: 10, avgPrice: 4500 }), { text: 'BBRI ditambahkan, 10 lot @ Rp4.500', groupName: 'Tanpa tesis', kind: 'add' });
  assert.deepStrictEqual(p.logTrade('PTBA', 'sell', 20, 2600, false), { text: 'Jual PTBA 20 lot @ Rp2.600', groupName: 'Tanpa tesis', kind: 'out' });
  assert.strictEqual(p.logTrade('PTBA', 'sell', 60, 2600, true).text, 'Jual PTBA 60 lot @ Rp2.600, posisi ditutup');
  assert.strictEqual(p.logTrade('PTBA', 'buy', 5, 2500, false).kind, 'add');
  assert.deepStrictEqual(p.logDrop('UNTR'), { text: 'UNTR dikeluarkan dari portofolio', groupName: 'Tanpa tesis', kind: 'out' });
  assert.deepStrictEqual(p.logCash(8_570_000), { text: 'Dana tunai diperbarui jadi Rp8,6 jt', groupName: 'Dana tunai', kind: 'neutral' });
  assert.strictEqual(p.logEdit('PTBA', { lots: 60, avgPrice: 2400 }, { lots: 60, avgPrice: 2400 }), null);
  assert.strictEqual(p.logEdit('PTBA', { lots: 60, avgPrice: 2400 }, { lots: 70, avgPrice: 2400 }).text, 'PTBA diubah: modal jadi Rp16,8 jt');
});

test('placement: role + chips from the first theme by stage order', () => {
  const t = (slug) => ({ slug, name: slug });
  const stages = [
    { order: 3, name: 'Pembangkit listrik', shortName: 'PLTU', groupKey: 'hilir', tickers: ['PTBA'], theme: t('batubara') },
    { order: 1, name: 'Pemilik tambang', shortName: null, groupKey: 'hulu', tickers: ['PTBA', 'AADI'], theme: t('batubara') },
    { order: 1, name: 'Lain', shortName: 'X', groupKey: 'hulu', tickers: ['PTBA'], theme: t('nikel') },
  ];
  assert.deepStrictEqual(p.placement(stages, 'PTBA'), { role: 'Pemilik tambang · PLTU', stages: ['hulu', 'hilir'] }); // batubara & nikel tie on order 1: input order keeps batubara
  assert.deepStrictEqual(p.placement(stages, 'TLKM'), { role: null, stages: [] });
});

test('view: totals, tanpa-tesis contract, deleted company falls back to the ticker', () => {
  const now = new Date('2026-11-12T00:00:00Z');
  const v = p.view({
    cash: 8_570_000,
    holdings: [{ ticker: 'PTBA', lots: 60, avgPrice: 2400, createdAt: now }, { ticker: 'GONE', lots: 1, avgPrice: 1000, createdAt: now }],
    companies: [{ ticker: 'PTBA', name: 'Bukit Asam Tbk', logoUrl: '/logos/emiten/logo-ptba.svg', tagline: 'BUMN', sector: { slug: 'energi', name: 'Energi' } }],
    stages: [],
    logs: [{ id: 'l1', createdAt: now, text: 't', groupName: 'Tanpa tesis', kind: 'add' }],
  });
  assert.deepStrictEqual(v.totals, { stock: 14_400_000 + 100_000, cash: 8_570_000, total: 14_400_000 + 100_000 + 8_570_000 });
  assert.deepStrictEqual(v.theses, []);
  assert.strictEqual(v.holdings[0].role, 'BUMN'); // no theme → company tagline
  assert.deepStrictEqual([v.holdings[0].thesisId, v.holdings[0].targetPct, v.holdings[0].status], [null, null, 'ok']);
  assert.deepStrictEqual([v.holdings[1].name, v.holdings[1].sector, v.holdings[1].logoUrl], ['GONE', null, null]);
  assert.deepStrictEqual(v.log[0], { id: 'l1', at: now, text: 't', group: 'Tanpa tesis', kind: 'add' });
});
