'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const c = require('../controllers/adminAuthController');

const router = express.Router();

router.post('/auth/login', c.login);
router.post('/auth/verify', requireAdmin.pending, c.verify);
router.post('/auth/logout', c.logout);
router.get('/auth/me', requireAdmin, c.me);

module.exports = router;
