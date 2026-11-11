'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const c = require('../controllers/adminAuthController');
const companiesRouter = require('./adminCompanies');
const usersRouter = require('./adminUsers');
const themesRouter = require('./adminThemes');
const accessRouter = require('./adminAccess');
const historyRouter = require('./adminHistory');

const router = express.Router();

router.post('/auth/login', c.login);
router.post('/auth/verify', requireAdmin.pending, c.verify);
router.post('/auth/logout', c.logout);
router.post('/auth/accept-invite', c.acceptInvite);
router.get('/auth/me', requireAdmin, c.me);

router.use('/companies', companiesRouter);
router.use('/users', usersRouter);
router.use('/themes', themesRouter);
router.use('/access', accessRouter);
router.use('/history', historyRouter);

module.exports = router;
