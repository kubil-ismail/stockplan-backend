'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const c = require('../controllers/adminHistoryController');

const router = express.Router();
router.use(requireAdmin);

// `log` = module "Riwayat perubahan": view = see, edit = "Kembalikan". Append-only: there is no update/delete route.
router.get('/', requirePerm('log', 'view'), c.index);
router.get('/export.csv', requirePerm('log', 'view'), c.exportCsv); // before /:id
router.post('/:id/revert', requirePerm('log', 'edit'), c.revert);

module.exports = router;
