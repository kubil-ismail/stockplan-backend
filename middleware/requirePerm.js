'use strict';

const { can } = require('../lib/adminRoles');
const { fail } = require('../lib/http');

// Use after requireAdmin: requirePerm('em', 'edit').
module.exports = (module_, action) => (req, res, next) =>
  can(req.admin.role, module_, action)
    ? next()
    : fail(res, 403, 'FORBIDDEN', 'Peran Anda tidak punya izin untuk aksi ini.'); // COPY: perlu review
