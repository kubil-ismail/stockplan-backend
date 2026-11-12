'use strict';

const express = require('express');
const requireAdmin = require('../middleware/requireAdmin');
const requirePerm = require('../middleware/requirePerm');
const requireSyncAgent = require('../middleware/requireSyncAgent');
const c = require('../controllers/adminSyncController');

const router = express.Router();

// Crawler endpoints: machine token, no admin session. Registered before requireAdmin.
router.get('/agent/queue', requireSyncAgent, c.queue);
router.post('/agent/jobs/:key/report', requireSyncAgent, c.report);
router.post('/agent/companies', requireSyncAgent, c.companies);

// `sync` = module "Sinkron data BEI": view = see, edit = run, retry, resolve conflicts.
router.use(requireAdmin);
router.get('/', requirePerm('sync', 'view'), c.index);
router.post('/run', requirePerm('sync', 'edit'), c.run);
router.post('/failures/:id/retry', requirePerm('sync', 'edit'), c.retry);
router.post('/conflicts/resolve', requirePerm('sync', 'edit'), c.resolveMany); // before /:id
router.post('/conflicts/:id/resolve', requirePerm('sync', 'edit'), c.resolve);

module.exports = router;
