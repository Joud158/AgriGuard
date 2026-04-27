const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const controller = require('../controllers/satelliteController');

const router = express.Router();

router.use(authenticate);
router.get('/analytics', authorize('admin', 'coach', 'player'), controller.getSatelliteAnalytics);

module.exports = router;
