'use strict';

const test = require('node:test');
const assert = require('node:assert');
const totp = require('./totp');

// RFC 6238 appendix B vector (SHA1): secret "12345678901234567890", T=59s -> 94287082 (last 6: 287082).
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('code matches the RFC 6238 test vector', () => {
  assert.strictEqual(totp.code(RFC_SECRET, 59000), '287082');
});

test('verify accepts adjacent step, rejects others', () => {
  assert.ok(totp.verify(RFC_SECRET, '287082', 59000 + 30000));
  assert.ok(!totp.verify(RFC_SECRET, '287082', 59000 + 90000));
  assert.ok(!totp.verify(RFC_SECRET, '12345', 59000));
});

test('newSecret is base32 and usable', () => {
  const s = totp.newSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.ok(totp.verify(s, totp.code(s)));
});
