'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const c = require('../controllers/adminAccessController');

const router = express.Router();
router.use(requireAdmin);

// `acc` = module "Akses & peran" (sensitive; by default only Super admin has it).
router.get('/members', requirePerm('acc', 'view'), c.members);
router.post('/members/invite', requirePerm('acc', 'edit'), c.invite);
router.patch('/members/:id', requirePerm('acc', 'edit'), c.changeRole);
router.post('/members/:id/resend-invite', requirePerm('acc', 'edit'), c.resendInvite);
router.post('/members/:id/deactivate', requirePerm('acc', 'delete'), c.deactivate);
router.post('/members/:id/reactivate', requirePerm('acc', 'delete'), c.reactivate);
router.get('/roles', requirePerm('acc', 'view'), c.roles);
router.post('/roles', requirePerm('acc', 'edit'), c.createRole);
router.put('/roles/:id', requirePerm('acc', 'edit'), c.updateRole);

module.exports = router;
