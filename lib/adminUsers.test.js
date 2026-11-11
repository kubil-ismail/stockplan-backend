'use strict';

const test = require('node:test');
const assert = require('node:assert');
const u = require('./adminUsers');

const NOW = Date.parse('2026-11-06T12:00:00Z');
const day = (n) => new Date(NOW - n * 24 * 3600 * 1000);
const user = (o) => ({ id: 'x', name: 'Budi', email: 'b@e.com', emailVerified: true, plan: 'yearly', createdAt: day(40), lastActiveAt: day(1), suspendedAt: null, ...o });

test('statusOf: suspended beats everything, then unverified, then idle by 30 days', () => {
  assert.strictEqual(u.statusOf(user({ suspendedAt: day(1), emailVerified: false }), NOW), 'sus');
  assert.strictEqual(u.statusOf(user({ emailVerified: false, lastActiveAt: null }), NOW), 'new');
  assert.strictEqual(u.statusOf(user({ lastActiveAt: day(29) }), NOW), 'act');
  assert.strictEqual(u.statusOf(user({ lastActiveAt: day(31) }), NOW), 'idle');
  assert.strictEqual(u.statusOf(user({ lastActiveAt: null, createdAt: day(3) }), NOW), 'act'); // new, never logged in yet
  assert.strictEqual(u.statusOf(user({ lastActiveAt: null, createdAt: day(60) }), NOW), 'idle');
});

test('validateSuspend needs a known reason; note is capped', () => {
  assert.strictEqual(u.validateSuspend({}).errors.reason, 'Pilih alasan dulu');
  assert.strictEqual(u.validateSuspend({ reason: 'Bebas' }).errors.reason, 'Alasan tidak dikenal.');
  assert.ok(u.validateSuspend({ reason: 'Lainnya', note: 'x'.repeat(501) }).errors.note);
  assert.deepStrictEqual(u.validateSuspend({ reason: 'Spam atau akun palsu', note: ' a ' }), { values: { reason: 'Spam atau akun palsu', note: 'a' }, errors: null });
});

test('validateInvite normalizes and rejects bad emails', () => {
  assert.strictEqual(u.validateInvite({ email: ' A@B.com ' }).values.email, 'a@b.com');
  assert.strictEqual(u.validateInvite({ email: 'nope' }).errors.email, 'Email belum valid');
});

test('deviceLabel reads common user agents', () => {
  assert.strictEqual(u.deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'), 'Chrome · Windows');
  assert.strictEqual(u.deviceLabel('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120'), 'Edge · Windows');
  assert.strictEqual(u.deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit Version/17 Mobile Safari/604.1'), 'Safari · iPhone');
  assert.strictEqual(u.deviceLabel('curl/8.0'), 'Perangkat tidak dikenal');
});

test('detailView exposes counts only and the right actions per state', () => {
  const d = u.detailView(user(), { watchlistCount: 14, sessions: [{ userAgent: 'curl', updatedAt: day(1) }] }, NOW);
  assert.strictEqual(d.usage.watchlist, 14);
  assert.deepStrictEqual(d.actions, { resendConfirmation: false, resetPassword: true, suspend: true, restore: false });
  assert.strictEqual(d.account.planInterest, 'Tahunan · Rp790.000/tahun · minta diingatkan');
  const s = u.detailView(user({ suspendedAt: day(2), suspendReason: 'Lainnya' }), {}, NOW);
  assert.deepStrictEqual(s.actions, { resendConfirmation: false, resetPassword: false, suspend: false, restore: true });
  assert.strictEqual(s.suspension.reason, 'Lainnya');
  assert.strictEqual(u.detailView(user({ emailVerified: false }), {}, NOW).actions.resendConfirmation, true);
  assert.strictEqual(u.detailView(user({ plan: 'beta' }), {}, NOW).account.planInterest, 'Belum memilih');
});

test('toCsv guards formulas', () => {
  const csv = u.toCsv([u.listRow(user({ name: '=HYPERLINK("x")' }), NOW)]);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.ok(csv.startsWith('Nama,Email,Bergabung'));
});
