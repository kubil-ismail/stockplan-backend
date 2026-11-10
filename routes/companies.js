'use strict';

const express = require('express');
const requireAuth = require('../middleware/requireAuth');
const companyController = require('../controllers/companyController');

const router = express.Router();

router.use(requireAuth);
router.get('/', companyController.index);
router.get('/:ticker', companyController.show);
router.put('/:ticker/alerts/:kind', companyController.subscribe);
router.delete('/:ticker/alerts/:kind', companyController.unsubscribe);

module.exports = router;
