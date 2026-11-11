'use strict';

const test = require('node:test');
const assert = require('node:assert');
const a = require('./adminAccess');

const sup = (o) => ({ id: 's1', role: 'super', status: 'active', ...o });
const data = (o) => ({ id: 'd1', role: 'data', status: 'active', ...o });

test('validateInvite needs a work email and a role', () => {
  assert.strictEqual(a.validateInvite({ email: 'x@gmail.com', role: 'data' }).errors.email, 'Gunakan email kerja @stockplan.id');
  assert.ok(a.validateInvite({ email: 'x@stockplan.id' }).errors.role);
  assert.deepStrictEqual(a.validateInvite({ email: ' Kevin@StockPlan.id ', role: 'tema' }), { values: { email: 'kevin@stockplan.id', role: 'tema' }, errors: null });
});

test('validateAccept: password at least 10 chars', () => {
  assert.ok(a.validateAccept({ token: 't', password: 'pendek' }).errors.password);
  assert.strictEqual(a.validateAccept({ token: 't', password: 'cukupPanjang1' }).errors, null);
});

test('roleChangeError: self, super-only, last super', () => {
  assert.strictEqual(a.roleChangeError(sup(), sup(), 'data', 2), 'Tidak bisa mengubah peran sendiri');
  assert.match(a.roleChangeError(data(), data({ id: 'd2' }), 'super', 1), /Hanya super admin/);
  assert.match(a.roleChangeError(data(), sup({ id: 's2' }), 'view', 2), /Hanya super admin/);
  assert.strictEqual(a.roleChangeError(sup(), sup({ id: 's2' }), 'data', 1), 'Harus ada minimal 1 super admin aktif');
  assert.strictEqual(a.roleChangeError(sup(), sup({ id: 's2' }), 'data', 2), null);
  assert.strictEqual(a.roleChangeError(sup(), data({ id: 'd2' }), 'super', 1), null);
});

test('deactivateError: self, last super, not active', () => {
  assert.ok(a.deactivateError(sup(), sup(), 3));
  assert.strictEqual(a.deactivateError(sup(), sup({ id: 's2' }), 1), 'Harus ada minimal 1 super admin aktif');
  assert.ok(a.deactivateError(sup(), data({ status: 'invited' }), 2));
  assert.strictEqual(a.deactivateError(sup(), data(), 1), null);
});

test('memberView: locks, 2FA states, actions, invite expiry', () => {
  const now = Date.parse('2026-11-11T05:00:00Z');
  const me = sup();
  const v = (m, o = {}) => a.memberView(m, { me, roleName: 'X', activeSupers: 1, now, ...o });
  assert.deepStrictEqual([v(me).roleLocked, v(me).roleLockReason], [true, 'Tidak bisa mengubah peran sendiri']);
  const other = v(sup({ id: 's2' }));
  assert.strictEqual(other.roleLockReason, 'Super admin terakhir');
  assert.strictEqual(other.actions.deactivate, false);
  const inv = v(data({ status: 'invited', inviteExpiresAt: new Date(now - 1) }));
  assert.deepStrictEqual([inv.twoFactor, inv.invite.expired, inv.actions.resendInvite], ['pending', true, true]);
  assert.strictEqual(v(data({ twoFactorEnabledAt: new Date() })).twoFactor, 'active');
  assert.strictEqual(v(data({ status: 'disabled' })).actions.reactivate, true);
  assert.deepStrictEqual(v(data(), { lastLogin: { at: 'x', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120 Safari/537' } }).lastLogin, { at: 'x', device: 'Chrome · Windows' });
});

test('jakartaDayStart is 00:00 WIB', () => {
  assert.strictEqual(a.jakartaDayStart(Date.parse('2026-11-11T05:00:00Z')).toISOString(), '2026-11-10T17:00:00.000Z');
  assert.strictEqual(a.jakartaDayStart(Date.parse('2026-11-10T18:00:00Z')).toISOString(), '2026-11-10T17:00:00.000Z');
  assert.strictEqual(a.nameFromEmail('kevin@stockplan.id'), 'Kevin');
});
