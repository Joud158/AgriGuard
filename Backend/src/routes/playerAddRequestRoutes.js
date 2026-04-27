const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/playerAddRequestController');
const { createPlayerAddRequestSchema } = require('../validators/clubManagementSchemas');

const router = express.Router();

router.use(authenticate);

router.post('/', authorize('coach'), validateBody(createPlayerAddRequestSchema), controller.createRequest);
router.get('/', authorize('admin', 'coach'), controller.listRequests);
router.patch('/:requestId/approve', authorize('admin'), controller.approveRequest);
router.patch('/:requestId/reject', authorize('admin'), controller.rejectRequest);

module.exports = router;
