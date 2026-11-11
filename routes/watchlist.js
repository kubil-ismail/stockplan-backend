'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const watchlistController = require('../controllers/watchlistController');

const router = express.Router();

router.use(requireAuth);
router.get('/', watchlistController.index);
router.post('/', watchlistController.create);
router.patch('/:ticker', watchlistController.update);
router.delete('/:ticker', watchlistController.destroy);

module.exports = router;
