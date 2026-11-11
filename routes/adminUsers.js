'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const c = require('../controllers/adminUserController');

const router = express.Router();
router.use(requireAdmin);

// `usr` = module "Pengguna" in the role matrix. `delete` = suspend/restore ("Hapus/tangguhkan", HANDOFF design §8.2).
router.get('/', requirePerm('usr', 'view'), c.index);
router.get('/export.csv', requirePerm('usr', 'view'), c.exportCsv); // before /:id
router.post('/invite', requirePerm('usr', 'edit'), c.invite);
router.get('/:id', requirePerm('usr', 'view'), c.show);
router.post('/:id/suspend', requirePerm('usr', 'delete'), c.suspend);
router.post('/:id/restore', requirePerm('usr', 'delete'), c.restore);
router.post('/:id/resend-confirmation', requirePerm('usr', 'edit'), c.resendConfirmation);
router.post('/:id/password-reset', requirePerm('usr', 'edit'), c.passwordReset);

module.exports = router;
