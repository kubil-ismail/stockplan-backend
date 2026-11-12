'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const c = require('../controllers/adminCompanyController');

const router = express.Router();
router.use(requireAdmin);

// `em` = module "Data emiten" in the role matrix (HANDOFF design §8.2).
router.get('/', requirePerm('em', 'view'), c.index);
router.get('/export.csv', requirePerm('em', 'view'), c.exportCsv); // before /:ticker
router.post('/bulk-review', requirePerm('em', 'edit'), c.bulkReview);
router.post('/', requirePerm('em', 'edit'), c.create);
router.get('/:ticker', requirePerm('em', 'view'), c.show);
router.patch('/:ticker', requirePerm('em', 'edit'), c.saveDraft);
router.post('/:ticker/publish', requirePerm('em', 'publish'), c.publish);
router.delete('/:ticker', requirePerm('em', 'delete'), c.destroy);

module.exports = router;
