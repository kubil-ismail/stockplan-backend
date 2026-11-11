'use strict';

const { UniqueConstraintError } = require('sequelize');
const { Company, Sector, Industry, Theme, ThemeStage, WatchlistItem } = require('../models');
const companies = require('../lib/companies');
const watchlist = require('../lib/watchlist');
const themes = require('../lib/themes');
const { fail } = require('../lib/http');

const NOT_FOUND = 'Emiten tidak ditemukan.'; // COPY: perlu review
const NOT_SAVED = 'Emiten ini tidak ada di watchlist Anda.'; // COPY: perlu review

// GET /watchlist — design: Watchlist. Newest first; client sorts/filters (stage is derived from checklist).
exports.index = async (req, res, next) => {
  try {
    const items = await WatchlistItem.findAll({
      where: { userId: req.user.id },
      include: [{
        model: Company, as: 'company', attributes: ['ticker', 'name', 'logoUrl', 'tagline', 'summary'],
        include: [{ model: Sector, as: 'sector', attributes: ['slug', 'name'] }, { model: Industry, as: 'industry', attributes: ['slug', 'name'] }],
      }],
      order: [['createdAt', 'DESC']],
    });
    const tickers = items.map((i) => i.ticker);
    const stages = tickers.length ? await ThemeStage.findAll({
      where: themes.stagesWithAny(tickers),
      include: [{ model: Theme, as: 'theme', where: { status: 'published' }, attributes: ['slug', 'name'] }],
    }) : [];
    res.json({ items: items.map((w) => watchlist.listItemView(w, stages)) });
  } catch (err) {
    next(err);
  }
};

// PATCH /watchlist/:ticker { note?, checklist? } — any change counts as "touched".
exports.update = async (req, res, next) => {
  const ticker = companies.normTicker(req.params.ticker);
  const { values, errors } = watchlist.validatePatch(req.body || {});
  if (errors) return fail(res, 422, 'VALIDATION', Object.values(errors)[0], errors);
  try {
    const item = companies.isTicker(ticker) ? await WatchlistItem.findOne({ where: { userId: req.user.id, ticker } }) : null;
    if (!item) return fail(res, 404, 'NOT_FOUND', NOT_SAVED);
    await item.update({ ...values, touchedAt: new Date() });
    res.json({ item: watchlist.itemView(item) });
  } catch (err) {
    next(err);
  }
};

// POST /watchlist { ticker, note? } — "Tambah ke watchlist". Idempotent: 201 new, 200 already saved.
exports.create = async (req, res, next) => {
  const body = req.body || {};
  const ticker = companies.normTicker(body.ticker);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!companies.isTicker(ticker)) return fail(res, 422, 'VALIDATION', NOT_FOUND, { ticker: NOT_FOUND });
  if (note.length > watchlist.NOTE_MAX) return fail(res, 422, 'VALIDATION', watchlist.MSG.noteLong, { note: watchlist.MSG.noteLong });

  try {
    if (!(await Company.findByPk(ticker, { attributes: ['ticker'] }))) {
      return fail(res, 422, 'VALIDATION', NOT_FOUND, { ticker: NOT_FOUND });
    }
    const [item, created] = await WatchlistItem.findOrCreate({
      where: { userId: req.user.id, ticker },
      defaults: { note, touchedAt: new Date() },
    });
    res.status(created ? 201 : 200).json({ item: watchlist.itemView(item) });
  } catch (err) {
    // Two parallel adds: the loser hits the unique index; the item exists, so report it.
    if (err instanceof UniqueConstraintError) {
      const item = await WatchlistItem.findOne({ where: { userId: req.user.id, ticker } });
      return res.status(200).json({ item: watchlist.itemView(item) });
    }
    next(err);
  }
};

// DELETE /watchlist/:ticker
exports.destroy = async (req, res, next) => {
  const ticker = companies.normTicker(req.params.ticker);
  try {
    const n = companies.isTicker(ticker) ? await WatchlistItem.destroy({ where: { userId: req.user.id, ticker } }) : 0;
    if (!n) return fail(res, 404, 'NOT_FOUND', NOT_SAVED);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
