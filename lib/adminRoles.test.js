'use strict';

const test = require('node:test');
const assert = require('node:assert');
const r = require('./adminRoles');

test('can reads a perms object; permsOf gives super everything', () => {
  const data = { em: ['view', 'edit', 'publish', 'delete'], acc: [] };
  assert.ok(r.can(data, 'em', 'publish'));
  assert.ok(!r.can(data, 'acc', 'view'));
  assert.ok(!r.can(data, 'nope', 'view'));
  assert.ok(!r.can(null, 'em', 'view'));
  const sup = r.permsOf({ id: 'super', perms: {} });
  assert.ok(r.can(sup, 'acc', 'delete') && r.can(sup, 'set', 'publish'));
  assert.deepStrictEqual(r.permsOf(null), {});
});

test('normalizePerms adds Lihat, drops nothing silently, rejects unavailable actions and unknown modules', () => {
  const { perms } = r.normalizePerms({ em: ['publish', 'edit'] });
  assert.deepStrictEqual(perms.em, ['view', 'edit', 'publish']);
  assert.deepStrictEqual(perms.dash, []);
  assert.ok(r.normalizePerms({ dash: ['edit'] }).error); // Dashboard only has Lihat
  assert.ok(r.normalizePerms({ xyz: ['view'] }).error);
  assert.ok(r.normalizePerms([]).error);
});

test('validateRole: name required on create, optional on update', () => {
  assert.strictEqual(r.validateRole({ perms: {} }, { creating: true }).errors.name, 'Beri nama peran dulu');
  assert.strictEqual(r.validateRole({ name: '  ' }).errors.name, 'Beri nama peran dulu');
  const { values, errors } = r.validateRole({ perms: { tm: ['edit'] } });
  assert.strictEqual(errors, null);
  assert.deepStrictEqual(values.perms.tm, ['view', 'edit']);
  assert.strictEqual(values.name, undefined);
});

test('roleId and sensitiveGrants', () => {
  assert.strictEqual(r.roleId('Analis Data & Riset'), 'analis-data-riset');
  assert.deepStrictEqual(r.sensitiveGrants({ usr: ['view'], set: ['view', 'edit'], acc: ['view', 'delete'] }), ['Pengaturan aplikasi', 'Akses & peran']);
});
