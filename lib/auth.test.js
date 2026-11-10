'use strict';

const test = require('node:test');
const assert = require('node:assert');
const auth = require('./auth');

const good = { name: 'Bil', email: ' Bil@Contoh.com ', password: 'Rahasia123', agreeTerms: true, agreeNotAdvice: true };

test('validateRegister accepts valid input and normalizes email', () => {
  const { values, errors } = auth.validateRegister(good);
  assert.strictEqual(errors, null);
  assert.strictEqual(values.email, 'bil@contoh.com');
});

test('validateRegister uses design messages', () => {
  const { errors } = auth.validateRegister({});
  assert.strictEqual(errors.name, 'Isi nama panggilan Anda.');
  assert.strictEqual(errors.email, 'Isi email Anda.');
  assert.strictEqual(errors.agree, 'Centang kedua pernyataan di atas untuk melanjutkan.');
  assert.strictEqual(auth.validateRegister({ ...good, email: 'x@y' }).errors.email, 'Format email belum benar. Contoh: nama@email.com');
});

test('validateRegister enforces password rules (8+, uppercase, digit)', () => {
  for (const password of ['Short1', 'nouppercase1', 'NoDigitsHere']) {
    assert.ok(auth.validateRegister({ ...good, password }).errors.password, password);
  }
  assert.ok(auth.validateRegister({ ...good, agreeNotAdvice: 'true' }).errors.agree, 'checkbox must be boolean true');
});

test('validateLogin defaults remember to true and requires password', () => {
  const { values, errors } = auth.validateLogin({ email: 'a@b.co' });
  assert.strictEqual(values.remember, true);
  assert.strictEqual(errors.password, 'Isi password Anda.');
});

test('hashPassword / verifyPassword round trip', async () => {
  const h = await auth.hashPassword('Rahasia123');
  assert.ok(await auth.verifyPassword('Rahasia123', h));
  assert.ok(!(await auth.verifyPassword('Rahasia124', h)));
  assert.ok(!(await auth.verifyPassword('x', 'garbage')));
});
