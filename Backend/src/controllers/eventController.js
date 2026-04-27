const asyncHandler = require('../utils/asyncHandler');
const eventService = require('../services/eventService');

const createEvent = asyncHandler(async (req, res) => {
  const data = await eventService.createEvent(req.auth, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const listEvents = asyncHandler(async (req, res) => {
  const data = await eventService.listEvents(req.auth);
  res.json({ success: true, data });
});

const getEvent = asyncHandler(async (req, res) => {
  const data = await eventService.getEvent(req.auth, req.params.id);
  res.json({ success: true, data });
});

const getEventOverlaps = asyncHandler(async (req, res) => {
  const data = await eventService.getEventOverlaps(req.auth, req.query);
  res.json({ success: true, data });
});

const updateEvent = asyncHandler(async (req, res) => {
  const data = await eventService.updateEvent(req.auth, req.params.id, req.validatedBody);
  res.json({ success: true, data });
});

const deleteEvent = asyncHandler(async (req, res) => {
  const data = await eventService.deleteEvent(req.auth, req.params.id);
  res.json({ success: true, data });
});

const transcribeEventAudio = asyncHandler(async (req, res) => {
  const speechToTextService = require('../services/speechToTextService');
  const data = await speechToTextService.transcribeAudio(req.validatedBody);
  res.json({ success: true, data });
});

const parseEventTranscript = asyncHandler(async (req, res) => {
  const eventVoiceNlpService = require('../services/eventVoiceNlpService');
  const data = await eventVoiceNlpService.parseEventTranscript(req.validatedBody);
  res.json({ success: true, data });
});

module.exports = {
  createEvent,
  listEvents,
  getEvent,
  getEventOverlaps,
  updateEvent,
  deleteEvent,
  transcribeEventAudio,
  parseEventTranscript,
};
