'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const c = require('../controllers/portfolioController');

const router = express.Router();

router.use(requireAuth);
router.get('/', c.index);
router.post('/holdings', c.addHolding);
router.patch('/holdings/:ticker', c.editHolding);
router.delete('/holdings/:ticker', c.dropHolding);
router.post('/transactions', c.trade);
router.put('/cash', c.setCash);

module.exports = router;
