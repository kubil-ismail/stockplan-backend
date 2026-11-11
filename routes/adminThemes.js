'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const c = require('../controllers/adminThemeController');

const router = express.Router();
router.use(requireAdmin);

// `tm` = module "Tema & rantai nilai" in the role matrix (HANDOFF design §8.2).
router.get('/', requirePerm('tm', 'view'), c.index);
router.post('/', requirePerm('tm', 'edit'), c.create);
router.get('/:slug', requirePerm('tm', 'view'), c.show);
router.patch('/:slug', requirePerm('tm', 'edit'), c.saveDraft);
router.post('/:slug/companies', requirePerm('tm', 'edit'), c.mapCompany);
router.post('/:slug/publish', requirePerm('tm', 'publish'), c.publish);

module.exports = router;
