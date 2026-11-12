'use strict';

const { Op, UniqueConstraintError } = require('sequelize');
const { sequelize, Company, Sector, Industry, ThemeStage, PortfolioHolding, PortfolioBalance, PortfolioLog } = require('../models');
const portfolio = require('../lib/portfolio');
const companies = require('../lib/companies');
const themes = require('../lib/themes');
const { fail } = require('../lib/http');

// Business-rule failure inside a transaction: thrown, rolled back, answered by `run`.
const reject = (status, code, message, fields) => Object.assign(new Error(message), { http: { status, code, fields } });
const invalid = (field, message) => reject(422, 'VALIDATION', message, { [field]: message });

// The whole page: cash, totals, holdings, log. Every mutation answers with this, so the client just replaces its state.
async function snapshot(userId) {
  const [balance, holdings, logs] = await Promise.all([
    PortfolioBalance.findByPk(userId),
    PortfolioHolding.findAll({ where: { userId }, order: [['createdAt', 'ASC'], ['ticker', 'ASC']] }),
    PortfolioLog.findAll({ where: { userId }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit: portfolio.LOG_MAX }),
  ]);
  const tickers = holdings.map((h) => h.ticker);
  const [rows, stages] = tickers.length ? await Promise.all([
    Company.findAll({
      where: { ticker: tickers }, attributes: ['ticker', 'name', 'logoUrl', 'tagline'],
      include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }],
    }),
    ThemeStage.findAll({
      where: themes.stagesWithAny(tickers),
      include: [{ model: Industry, as: 'theme', where: themes.clientVisible({ publishedAt: { [Op.ne]: null } }), attributes: ['slug', 'name'] }],
    }),
  ]) : [[], []];
  return portfolio.view({ cash: balance ? portfolio.toNum(balance.cash) : 0, holdings, companies: rows, stages, logs });
}

// Locks the user's balance row (created on first use): concurrent changes queue up, so cash can't be spent twice.
async function lockBalance(userId, transaction) {
  await PortfolioBalance.findOrCreate({ where: { userId }, defaults: { cash: 0 }, transaction });
  return PortfolioBalance.findByPk(userId, { transaction, lock: transaction.LOCK.UPDATE });
}
const lockHolding = (userId, ticker, transaction) => PortfolioHolding.findOne({ where: { userId, ticker }, transaction, lock: transaction.LOCK.UPDATE });
const writeLog = (userId, l, transaction) => PortfolioLog.create({ userId, ...l }, { transaction });

// Runs `work(transaction)`, then answers with the fresh snapshot. `work` throws reject(...) for rule violations.
async function run(req, res, next, work, status = 200) {
  try {
    await sequelize.transaction(work);
    res.status(status).json(await snapshot(req.user.id));
  } catch (err) {
    if (err.http) return fail(res, err.http.status, err.http.code, err.message, err.http.fields);
    if (err instanceof UniqueConstraintError) return fail(res, 409, 'ALREADY_HELD', portfolio.MSG.alreadyHeld, { ticker: portfolio.MSG.alreadyHeld });
    next(err);
  }
}

// Throws when the user wants to spend more cash than there is.
function spend(cash, value) {
  const msg = portfolio.cashError(cash, value);
  if (msg) throw invalid('useCash', msg);
}

const heldOr422 = (h) => {
  if (!h) throw invalid('ticker', portfolio.MSG.pickTicker);
  return h;
};

// GET /portfolio — design: Portofolio. Empty portfolio = `holdings: []` (PortofolioKosong).
exports.index = async (req, res, next) => {
  try {
    res.json(await snapshot(req.user.id));
  } catch (err) {
    next(err);
  }
};

// POST /portfolio/holdings { ticker, lots, avgPrice, useCash? } — "Tambah emiten". 201 + snapshot.
exports.addHolding = async (req, res, next) => {
  const { values: v, errors } = portfolio.validateAdd(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  // Only published, already-listed companies (an IPO has nothing to hold yet), like the watchlist.
  let company;
  try {
    company = await Company.findOne({ where: { ticker: v.ticker, publishedAt: { [Op.ne]: null } }, attributes: ['ticker', 'status'] });
  } catch (err) {
    return next(err);
  }
  if (!company || company.status === 'ipo') return fail(res, 422, 'VALIDATION', portfolio.MSG.notListed, { ticker: portfolio.MSG.notListed });

  return run(req, res, next, async (t) => {
    const bal = await lockBalance(req.user.id, t);
    if (await PortfolioHolding.count({ where: { userId: req.user.id, ticker: v.ticker }, transaction: t })) {
      throw reject(409, 'ALREADY_HELD', portfolio.MSG.alreadyHeld, { ticker: portfolio.MSG.alreadyHeld });
    }
    const h = await PortfolioHolding.create({ userId: req.user.id, ticker: v.ticker, lots: v.lots, avgPrice: v.avgPrice }, { transaction: t });
    if (v.useCash) {
      const value = portfolio.capital(h);
      spend(portfolio.toNum(bal.cash), value);
      await bal.update({ cash: portfolio.toNum(bal.cash) - value }, { transaction: t });
    }
    await writeLog(req.user.id, portfolio.logAdd(h), t);
  }, 201);
};

// POST /portfolio/transactions { ticker, side: 'buy'|'sell', lots, price, useCash? } — "Catat transaksi".
// Buy re-weights the average price, sell keeps it; selling every lot closes the position. No fees are applied (as in the dialog).
exports.trade = async (req, res, next) => {
  const { values: v, errors } = portfolio.validateTrade(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);

  return run(req, res, next, async (t) => {
    const bal = await lockBalance(req.user.id, t);
    const h = heldOr422(await lockHolding(req.user.id, v.ticker, t));
    if (v.side === 'sell' && v.lots > h.lots) throw invalid('lots', portfolio.MSG.onlyHold(h.lots, h.ticker));
    const value = v.lots * portfolio.LOT * v.price;
    if (v.useCash && v.side === 'buy') spend(portfolio.toNum(bal.cash), value);
    const after = portfolio.afterTrade(h, v.side, v.lots, v.price);
    if (after.lots === 0) await h.destroy({ transaction: t });
    else await h.update(after, { transaction: t });
    await bal.update({ cash: portfolio.cashAfter(portfolio.toNum(bal.cash), v.side, value, v.useCash) }, { transaction: t });
    await writeLog(req.user.id, portfolio.logTrade(h.ticker, v.side, v.lots, v.price, after.lots === 0), t);
  });
};

// PATCH /portfolio/holdings/:ticker { lots?, avgPrice? } — "Kelola": correct what was recorded. Cash is not touched.
exports.editHolding = async (req, res, next) => {
  const ticker = companies.normTicker(req.params.ticker);
  const { values, errors } = portfolio.validateEdit(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);

  return run(req, res, next, async (t) => {
    const h = await lockHolding(req.user.id, ticker, t);
    if (!h) throw reject(404, 'NOT_FOUND', portfolio.MSG.notHeld);
    const before = { lots: h.lots, avgPrice: h.avgPrice };
    await h.update(values, { transaction: t });
    const entry = portfolio.logEdit(h.ticker, before, h);
    if (entry) await writeLog(req.user.id, entry, t);
  });
};

// DELETE /portfolio/holdings/:ticker?refund=true — "Keluarkan". refund adds the capital back to cash.
// Answers 200 + snapshot (not 204), like the other portfolio changes. The log keeps its history.
exports.dropHolding = async (req, res, next) => {
  const ticker = companies.normTicker(req.params.ticker);
  const refund = req.query.refund === 'true' || req.query.refund === '1';

  return run(req, res, next, async (t) => {
    const bal = await lockBalance(req.user.id, t);
    const h = await lockHolding(req.user.id, ticker, t);
    if (!h) throw reject(404, 'NOT_FOUND', portfolio.MSG.notHeld);
    await h.destroy({ transaction: t });
    if (refund) await bal.update({ cash: portfolio.toNum(bal.cash) + portfolio.capital(h) }, { transaction: t });
    await writeLog(req.user.id, portfolio.logDrop(h.ticker), t);
  });
};

// PUT /portfolio/cash { amount } — "Ubah dana tunai". Only a real change is logged.
exports.setCash = async (req, res, next) => {
  const { amount, errors } = portfolio.validateCash(req.body);
  if (errors) return fail(res, 422, 'VALIDATION', errors.amount, errors);

  return run(req, res, next, async (t) => {
    const bal = await lockBalance(req.user.id, t);
    if (portfolio.toNum(bal.cash) === amount) return;
    await bal.update({ cash: amount }, { transaction: t });
    await writeLog(req.user.id, portfolio.logCash(amount), t);
  });
};
