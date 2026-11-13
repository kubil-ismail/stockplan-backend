'use strict';

// Pure logic for Portofolio (HANDOFF §6.5). Every number is based on CAPITAL = lots × 100 × average buy price,
// never on a market price. Messages and log sentences are copied from the client/design.
const { normTicker, isTicker } = require('./companies');

const LOT = 100; // shares per lot
const LIMITS = { lots: 1_000_000, price: 10_000_000, cash: 1e15 }; // keeps capital (lots × 100 × price) under 2^53 and the BIGINT column
const LOG_MAX = 50;
// shortcut: only the latest 50 log rows are returned, no paging; upgrade: ?before= cursor when the page gets a "lihat semua".

const idr = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const rupiah = (n) => `Rp${idr.format(Math.round(n))}`;
// Rp12,4 T · Rp8,6 jt (same as the client's rupiahShort)
function rupiahShort(n) {
  const f = (v, unit) => `Rp${v.toFixed(1).replace('.', ',')} ${unit}`;
  const a = Math.abs(n);
  if (a >= 1e12) return f(n / 1e12, 'T');
  if (a >= 1e9) return f(n / 1e9, 'M');
  if (a >= 1e6) return f(n / 1e6, 'jt');
  return rupiah(n);
}

const MSG = {
  pickTicker: 'Pilih emitennya dulu.',
  notListed: 'Emiten ini tidak ditemukan atau belum tercatat di bursa.', // COPY: perlu review
  alreadyHeld: 'Emiten ini sudah ada di portofolio Anda.', // COPY: perlu review
  notHeld: 'Emiten ini tidak ada di portofolio Anda.', // COPY: perlu review
  fillAdd: 'Isi jumlah lot dan harga beli.',
  fillTrade: 'Isi jumlah lot dan harga.',
  fillEdit: 'Lot dan harga beli harus lebih dari 0.',
  tooBig: 'Angkanya terlalu besar.', // COPY: perlu review
  side: 'Pilih beli atau jual.', // COPY: perlu review
  cashAmount: 'Isi dana tunai dengan angka 0 atau lebih.', // COPY: perlu review
  nothing: 'Tidak ada yang diubah.', // COPY: perlu review
  body: 'Isian tidak valid.', // COPY: perlu review
  insufficient: (cash) => `Dana tunai tidak cukup (sisa ${rupiahShort(cash)}).`,
  onlyHold: (lots, ticker) => `Anda hanya memegang ${lots} lot ${ticker}.`,
};

const capital = (h) => h.lots * LOT * h.avgPrice;
const sum = (xs, f) => xs.reduce((s, x) => s + f(x), 0);
// pg returns BIGINT as string; cash stays far below 2^53.
const toNum = (v) => Number(v);

// Buy: weighted average price. Sell: average stays. Zero lots left = position closed.
function afterTrade(h, side, lots, price) {
  const newLots = side === 'sell' ? h.lots - lots : h.lots + lots;
  const avgPrice = side === 'sell' || newLots <= 0 ? h.avgPrice : Math.round((h.lots * h.avgPrice + lots * price) / newLots);
  return { lots: newLots, avgPrice };
}

// Cash after a trade; unchanged unless useCash.
const cashAfter = (cash, side, value, useCash) => (!useCash ? cash : side === 'sell' ? cash + value : cash - value);
const cashError = (cash, value) => (value > cash ? MSG.insufficient(cash) : null);

// ---- validation (body -> { values, errors }) ----
const isObj = (b) => !!b && typeof b === 'object' && !Array.isArray(b);
const posInt = (v, max) => Number.isInteger(v) && v > 0 && v <= max;
const finish = (values, errors) => ({ values, errors: Object.keys(errors).length ? errors : null });

// Lots + price as the dialogs ask for them: missing/zero/non-integer → `fill`, above the limit → tooBig.
function checkLotsPrice(lots, price, fill, errors) {
  if (!Number.isInteger(lots) || lots < 1 || !Number.isInteger(price) || price < 1) errors.lots = fill;
  else if (lots > LIMITS.lots || price > LIMITS.price) errors.lots = MSG.tooBig;
}

// POST /portfolio/holdings { ticker, lots, avgPrice, useCash? } — "Tambah emiten"
function validateAdd(body) {
  const b = isObj(body) ? body : {};
  const errors = {};
  const ticker = normTicker(b.ticker);
  if (!isTicker(ticker)) errors.ticker = MSG.pickTicker;
  checkLotsPrice(b.lots, b.avgPrice, MSG.fillAdd, errors);
  if (b.useCash !== undefined && typeof b.useCash !== 'boolean') errors.useCash = MSG.body;
  return finish({ ticker, lots: b.lots, avgPrice: b.avgPrice, useCash: b.useCash === true }, errors);
}

// POST /portfolio/transactions { ticker, side, lots, price, useCash? } — "Catat transaksi"
function validateTrade(body) {
  const b = isObj(body) ? body : {};
  const errors = {};
  const ticker = normTicker(b.ticker);
  if (!isTicker(ticker)) errors.ticker = MSG.pickTicker;
  if (b.side !== 'buy' && b.side !== 'sell') errors.side = MSG.side;
  checkLotsPrice(b.lots, b.price, MSG.fillTrade, errors);
  if (b.useCash !== undefined && typeof b.useCash !== 'boolean') errors.useCash = MSG.body;
  return finish({ ticker, side: b.side, lots: b.lots, price: b.price, useCash: b.useCash === true }, errors);
}

// PATCH /portfolio/holdings/:ticker { lots?, avgPrice? } — "Kelola": correct what was recorded.
function validateEdit(body) {
  const b = isObj(body) ? body : {};
  const errors = {};
  const values = {};
  for (const [k, max] of [['lots', LIMITS.lots], ['avgPrice', LIMITS.price]]) {
    if (b[k] === undefined) continue;
    if (!Number.isInteger(b[k]) || b[k] < 1) errors.lots = MSG.fillEdit;
    else if (b[k] > max) errors.lots = MSG.tooBig;
    else values[k] = b[k];
  }
  if (!Object.keys(errors).length && !Object.keys(values).length) errors.form = MSG.nothing;
  return finish(values, errors);
}

// PUT /portfolio/cash { amount } — "Ubah dana tunai"
function validateCash(body) {
  const amount = isObj(body) ? body.amount : undefined;
  return Number.isInteger(amount) && amount >= 0 && amount <= LIMITS.cash ? { amount, errors: null } : { amount: null, errors: { amount: MSG.cashAmount } };
}

// ---- Riwayat keputusan sentences ----
const NO_THESIS = 'Tanpa tesis';
const CASH_GROUP = 'Dana tunai';
const log = (text, groupName, kind) => ({ text, groupName, kind });
const logAdd = (h) => log(`${h.ticker} ditambahkan, ${h.lots} lot @ ${rupiah(h.avgPrice)}`, NO_THESIS, 'add');
const logTrade = (ticker, side, lots, price, closed) => log(
  `${side === 'sell' ? 'Jual' : 'Beli'} ${ticker} ${lots} lot @ ${rupiah(price)}${closed ? ', posisi ditutup' : ''}`, NO_THESIS, side === 'sell' ? 'out' : 'add',
);
const logDrop = (ticker) => log(`${ticker} dikeluarkan dari portofolio`, NO_THESIS, 'out');
const logCash = (amount) => log(`Dana tunai diperbarui jadi ${rupiahShort(amount)}`, CASH_GROUP, 'neutral');
// Only when the capital changed; returns null when there is nothing to log.
const logEdit = (ticker, before, after) => (capital(before) === capital(after) ? null
  : log(`${ticker} diubah: modal jadi ${rupiahShort(capital(after))}`, NO_THESIS, 'neutral'));

// ---- response ----
// stages: published ThemeStage rows (with .theme) containing the ticker. The first theme by stage order gives the
// holding its role line ("Pemilik tambang · PLTU") and chips (group keys: hulu/tengah/hilir/...).
function placement(stages, ticker) {
  const mine = stages.filter((s) => (s.tickers || []).includes(ticker)).sort((a, b) => a.order - b.order);
  if (!mine.length) return { role: null, stages: [], theme: null };
  const inFirst = mine.filter((s) => s.theme.slug === mine[0].theme.slug);
  return {
    role: inFirst.map((s) => s.shortName || s.name).join(' · '), stages: [...new Set(inFirst.map((s) => s.groupKey))],
    theme: { slug: mine[0].theme.slug, name: mine[0].theme.name },
  };
}

// holding: row; company: Company row | undefined (deleted by admin → bare ticker).
function holdingView(h, company, stages) {
  const p = placement(stages, h.ticker);
  return {
    ticker: h.ticker, name: company ? company.name : h.ticker, logoUrl: (company && company.logoUrl) || null,
    sector: company && company.sector ? { slug: company.sector.slug, name: company.sector.name } : null,
    role: p.role || (company && company.tagline) || null, stages: p.stages, theme: p.theme,
    thesisId: null, targetPct: null, // filled by the Tesis module
    lots: h.lots, avgPrice: h.avgPrice, capital: capital(h),
    status: 'ok', // 'review' = a thesis condition fired; set by the Tesis module
    addedAt: h.createdAt,
  };
}

const logView = (l) => ({ id: l.id, at: l.createdAt, text: l.text, group: l.groupName, kind: l.kind });

function view({ cash, holdings, companies, stages, logs }) {
  const byTicker = new Map(companies.map((c) => [c.ticker, c]));
  const rows = holdings.map((h) => holdingView(h, byTicker.get(h.ticker), stages));
  const stock = sum(rows, (r) => r.capital);
  return {
    cash,
    totals: { stock, cash, total: stock + cash },
    theses: [], // filled by the Tesis module; until then every holding is "Tanpa tesis"
    holdings: rows,
    log: logs.map(logView),
  };
}

module.exports = {
  LOT, LIMITS, LOG_MAX, MSG, NO_THESIS,
  rupiah, rupiahShort, capital, toNum, afterTrade, cashAfter, cashError,
  validateAdd, validateTrade, validateEdit, validateCash,
  logAdd, logTrade, logDrop, logCash, logEdit, placement, holdingView, view,
};
