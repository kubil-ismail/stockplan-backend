'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const me = require('../controllers/meController');

const router = express.Router();

router.use(requireAuth);
router.get('/', me.show);
router.patch('/', me.update);
router.patch('/prefs', me.updatePrefs);
router.post('/email', me.requestEmailChange);
router.delete('/', me.destroy);
router.post('/password', me.changePassword);
router.get('/sessions', me.sessions);
router.delete('/sessions/:id', me.revokeSession);

module.exports = router;
