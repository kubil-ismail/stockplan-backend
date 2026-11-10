'use strict';

const test = require('node:test');
const assert = require('node:assert');
const p = require('./profile');

test('validateProfile only touches fields that are present', () => {
  assert.deepStrictEqual(p.validateProfile({ name: '  Budi ' }), { values: { name: 'Budi' }, errors: null });
  assert.deepStrictEqual(p.validateProfile({}), { values: {}, errors: null });
});

test('validateProfile rejects bad values with design copy', () => {
  const { errors } = p.validateProfile({ name: ' ', experience: 'x', horizon: 'x', interestedThemes: [1] });
  assert.strictEqual(errors.name, 'Nama tidak boleh kosong.');
  assert.ok(errors.experience && errors.horizon && errors.interestedThemes);
  assert.strictEqual(p.validateProfile({ interestedThemes: ['A', 'A'] }).values.interestedThemes.length, 1);
});

test('validatePasswordChange follows design rules', () => {
  const ok = { currentPassword: 'old', newPassword: 'abcdefg1', confirmPassword: 'abcdefg1' };
  assert.strictEqual(p.validatePasswordChange(ok).errors, null);
  assert.strictEqual(p.validatePasswordChange({ ...ok, currentPassword: '' }).errors.currentPassword, 'Isi password Anda sekarang.');
  assert.strictEqual(p.validatePasswordChange({ ...ok, newPassword: 'abc' }).errors.newPassword, 'Password baru minimal 8 karakter dengan huruf dan angka.');
  assert.strictEqual(p.validatePasswordChange({ ...ok, confirmPassword: 'x' }).errors.confirmPassword, 'Kedua password baru belum sama.');
});

test('deviceLabel', () => {
  assert.strictEqual(p.deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit Chrome/120 Safari/537'), 'Chrome di macOS');
  assert.strictEqual(p.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17) AppleWebKit Version/17 Safari/604'), 'Safari di iOS');
  assert.strictEqual(p.deviceLabel(''), 'Peramban');
});
