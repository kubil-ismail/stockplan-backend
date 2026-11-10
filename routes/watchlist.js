'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const watchlistController = require('../controllers/watchlistController');

const router = express.Router();

router.use(requireAuth);
router.post('/', watchlistController.create);
router.delete('/:ticker', watchlistController.destroy);

module.exports = router;
