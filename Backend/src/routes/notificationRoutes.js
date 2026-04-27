const express = require('express');
const authenticate = require('../middleware/authenticate');
const controller = require('../controllers/notificationController');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.listNotifications);
router.patch('/:id/read', controller.markNotificationRead);

module.exports = router;
