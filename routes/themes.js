'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const themeController = require('../controllers/themeController');

const router = express.Router();

router.use(requireAuth);
router.get('/:slug', themeController.show);

module.exports = router;
