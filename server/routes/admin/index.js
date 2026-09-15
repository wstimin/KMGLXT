'use strict';

const express = require('express');

const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/settings', require('./settings'));
router.use('/stats', require('./stats'));
router.use('/cardTypes', require('./cardTypes'));
router.use('/cards', require('./cards'));
router.use('/import', require('./import'));
router.use('/projects', require('./projects'));
router.use('/audit', require('./audit'));
router.use('/logs', require('./logs'));
router.use('/backup', require('./backup'));

module.exports = router;