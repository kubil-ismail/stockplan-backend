'use strict';

const crypto = require('crypto');
const { fail } = require('../lib/http');

const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

// Crawler auth: `Authorization: Bearer <SYNC_TOKEN>`. Disabled (503) until SYNC_TOKEN is set to ≥ 32 chars.
module.exports = (req, res, next) => {
  const want = process.env.SYNC_TOKEN || '';
  if (want.length < 32) return fail(res, 503, 'SYNC_DISABLED', 'SYNC_TOKEN belum diisi di server.');
  const got = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!crypto.timingSafeEqual(digest(got), digest(want))) return fail(res, 401, 'UNAUTHENTICATED', 'Token sinkron salah.');
  next();
};
