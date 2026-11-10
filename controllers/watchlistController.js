'use strict';

const { UniqueConstraintError } = require('sequelize');
const { Company, WatchlistItem } = require('../models');
const companies = require('../lib/companies');
const watchlist = require('../lib/watchlist');
const { fail } = require('../lib/http');

const NOT_FOUND = 'Emiten tidak ditemukan.'; // COPY: perlu review
const NOTE_MAX = 2000;

// POST /watchlist { ticker, note? } — "Tambah ke watchlist". Idempotent: 201 new, 200 already saved.
exports.create = async (req, res, next) => {
  const body = req.body || {};
  const ticker = companies.normTicker(body.ticker);
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!companies.isTicker(ticker)) return fail(res, 422, 'VALIDATION', NOT_FOUND, { ticker: NOT_FOUND });
  if (note.length > NOTE_MAX) return fail(res, 422, 'VALIDATION', 'Catatan terlalu panjang.', { note: 'Catatan terlalu panjang.' }); // COPY: perlu review

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
    if (!n) return fail(res, 404, 'NOT_FOUND', 'Emiten ini tidak ada di watchlist Anda.'); // COPY: perlu review
    res.status(204).end();
  } catch (err) {
    next(err);
  }
};
