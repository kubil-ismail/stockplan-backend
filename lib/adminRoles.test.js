'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { can } = require('./adminRoles');

test('can follows the role matrix for Data emiten', () => {
  assert.ok(can('super', 'em', 'publish'));
  assert.ok(can('data', 'em', 'publish'));
  assert.ok(can('tema', 'em', 'view'));
  assert.ok(!can('tema', 'em', 'edit'));
  assert.ok(can('view', 'em', 'view'));
  assert.ok(!can('view', 'em', 'publish'));
  assert.ok(!can('ghost', 'em', 'view'));
  assert.ok(!can('super', 'nope', 'view'));
});
