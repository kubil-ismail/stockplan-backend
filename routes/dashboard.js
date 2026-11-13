'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const c = require('../controllers/dashboardController');

const router = express.Router();

router.use(requireAuth);
router.get('/', c.index);
router.post('/actions/:id/done', c.done);

module.exports = router;
