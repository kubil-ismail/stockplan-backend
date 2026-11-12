'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const c = require('../controllers/adminDashboardController');

const router = express.Router();
router.use(requireAdmin);

// `dash` = module "Dashboard": view only. Blocks inside need their own module's view permission (see controller).
router.get('/', requirePerm('dash', 'view'), c.index);

module.exports = router;
