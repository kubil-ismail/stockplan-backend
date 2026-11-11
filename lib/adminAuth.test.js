'use strict';

const test = require('node:test');
const assert = require('node:assert');
const a = require('./adminAuth');

test('validateLogin requires @stockplan.id and normalizes', () => {
  assert.strictEqual(a.validateLogin({ email: 'x@gmail.com', password: 'p' }).errors.email, 'Gunakan email kerja @stockplan.id.');
  const { values, errors } = a.validateLogin({ email: ' Rina@StockPlan.id ', password: 'p' });
  assert.strictEqual(errors, null);
  assert.strictEqual(values.email, 'rina@stockplan.id');
});

test('validateVerify checks format per method', () => {
  assert.strictEqual(a.validateVerify({ code: '12345' }).errors.code, 'Kode harus 6 digit angka.');
  assert.strictEqual(a.validateVerify({ method: 'backup', code: '123456' }).errors.code, 'Format kode cadangan: xxxx-xxxx.');
  assert.strictEqual(a.validateVerify({ method: 'backup', code: 'AB12-cd34' }).values.code, 'ab12-cd34');
  assert.strictEqual(a.validateVerify({ code: '123456', trustDevice: true }).errors, null);
});

test('lockState locks at 5 fails inside 15 minutes and unlocks after', () => {
  const now = 10_000_000;
  const fails = (n, ago) => Array.from({ length: n }, (_, i) => now - ago + i);
  assert.deepStrictEqual(a.lockState(fails(2, 60_000), now), { locked: false, left: 3 });
  const s = a.lockState(fails(5, 60_000), now);
  assert.ok(s.locked);
  assert.ok(s.until.getTime() > now);
  assert.strictEqual(a.lockState(fails(5, a.LOCK_MS + 10_000), now).locked, false);
});

test('backup codes look like xxxx-xxxx and hash case-insensitively', () => {
  const codes = a.newBackupCodes();
  assert.strictEqual(codes.length, 8);
  codes.forEach((c) => assert.match(c, /^[0-9a-f]{4}-[0-9a-f]{4}$/));
  assert.strictEqual(a.hashCode('AB12-CD34'), a.hashCode('ab12-cd34'));
});
