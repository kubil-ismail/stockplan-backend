'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/confirm-email-change', authController.confirmEmailChange);
router.post('/logout', requireAuth, authController.logout);

module.exports = router;
