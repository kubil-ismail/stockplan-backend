'use strict';

const crypto = require('crypto');

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const newSecret = () => {
  const bytes = crypto.randomBytes(20);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  return bits.match(/.{5}/g).map((c) => B32[parseInt(c, 2)]).join('');
};

function decode(secret) {
  let bits = '';
  for (const ch of secret.replace(/=+$/, '').toUpperCase()) bits += B32.indexOf(ch).toString(2).padStart(5, '0');
  return Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
}

// RFC 6238: HMAC-SHA1, 30 s step, 6 digits.
function code(secret, time = Date.now()) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const h = crypto.createHmac('sha1', decode(secret)).update(buf).digest();
  const o = h[19] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1e6).padStart(6, '0');
}

// Accepts the previous/next step too (clock drift).
function verify(secret, token, time = Date.now()) {
  const given = Buffer.from(String(token));
  return [-1, 0, 1].some((d) => {
    const want = Buffer.from(code(secret, time + d * 30000));
    return want.length === given.length && crypto.timingSafeEqual(want, given);
  });
}

const otpauthUri = (secret, email) =>
  `otpauth://totp/StockPlan%20Admin:${encodeURIComponent(email)}?secret=${secret}&issuer=StockPlan%20Admin`;

module.exports = { newSecret, code, verify, otpauthUri };
