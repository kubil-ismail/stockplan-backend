'use strict';

// Built-in roles, copied from stockplan-app-handoff/fixtures/admin-roles.json (HANDOFF design §8.2).
// shortcut: static; custom roles (AdminAksesPeran) need a table, upgrade: load roles from DB.
const ROLES = require('./adminRoles.json');

// action: view | edit | publish | delete. Unknown role or module → false.
const can = (roleId, module, action) => !!(ROLES[roleId] && (ROLES[roleId].perms[module] || []).includes(action));

module.exports = { ROLES, can };
