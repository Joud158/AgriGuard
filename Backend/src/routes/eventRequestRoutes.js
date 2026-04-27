const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/eventRequestController');
const {
  createEventRequestSchema,
  suggestEventRequestSchema,
  reviseEventRequestSchema,
  rejectEventRequestSchema,
} = require('../validators/eventRequestSchemas');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .post(authorize('player'), validateBody(createEventRequestSchema), controller.createEventRequest)
  .get(authorize('admin', 'coach', 'player'), controller.listEventRequests);

router.get('/:id', authorize('admin', 'coach', 'player'), controller.getEventRequest);
router.patch('/:id/assign-agronomist', authorize('admin'), controller.assignAgronomistToRequest);
router.patch('/:id/approve', authorize('admin', 'coach'), controller.approveEventRequest);
router.patch(
  '/:id/reject',
  authorize('admin', 'coach'),
  validateBody(rejectEventRequestSchema),
  controller.rejectEventRequest
);
router.patch(
  '/:id/suggest-modification',
  authorize('admin'),
  validateBody(suggestEventRequestSchema),
  controller.suggestEventRequestModification
);
router.patch('/:id/accept-suggestion', authorize('coach'), controller.acceptSuggestedEventRequest);
router.patch(
  '/:id/revise',
  authorize('coach'),
  validateBody(reviseEventRequestSchema),
  controller.reviseEventRequest
);

module.exports = router;
