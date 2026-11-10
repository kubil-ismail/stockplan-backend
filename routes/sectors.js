'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const sectorController = require('../controllers/sectorController');

const router = express.Router();

router.use(requireAuth);
router.get('/', sectorController.index);
router.get('/:slug', sectorController.show);

module.exports = router;
