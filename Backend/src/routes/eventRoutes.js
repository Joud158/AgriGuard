const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/eventController');
const {
  createEventSchema,
  updateEventSchema,
  parseVoiceTranscriptSchema,
  transcribeEventAudioSchema,
} = require('../validators/eventSchemas');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .post(authorize('admin'), validateBody(createEventSchema), controller.createEvent)
  .get(controller.listEvents);

router.get('/overlaps', controller.getEventOverlaps);

router.post(
  '/voice/transcribe',
  authorize('admin', 'coach'),
  validateBody(transcribeEventAudioSchema),
  controller.transcribeEventAudio
);
router.post(
  '/voice/parse',
  authorize('admin', 'coach'),
  validateBody(parseVoiceTranscriptSchema),
  controller.parseEventTranscript
);

router
  .route('/:id')
  .get(controller.getEvent)
  .patch(authorize('admin'), validateBody(updateEventSchema), controller.updateEvent)
  .delete(authorize('admin'), controller.deleteEvent);

module.exports = router;
