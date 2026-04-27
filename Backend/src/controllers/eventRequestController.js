const asyncHandler = require('../utils/asyncHandler');
const eventRequestService = require('../services/eventRequestService');

const createEventRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.createEventRequest(req.auth, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const listEventRequests = asyncHandler(async (req, res) => {
  const data = await eventRequestService.listEventRequests(req.auth);
  res.json({ success: true, data });
});

const getEventRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.getEventRequest(req.auth, req.params.id);
  res.json({ success: true, data });
});


const assignAgronomistToRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.assignAgronomistToRequest(
    req.auth,
    req.params.id,
    req.body || {}
  );
  res.json({ success: true, data });
});

const approveEventRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.approveEventRequest(req.auth, req.params.id);
  res.json({ success: true, data });
});

const rejectEventRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.rejectEventRequest(
    req.auth,
    req.params.id,
    req.validatedBody
  );
  res.json({ success: true, data });
});

const suggestEventRequestModification = asyncHandler(async (req, res) => {
  const data = await eventRequestService.suggestEventRequestModification(
    req.auth,
    req.params.id,
    req.validatedBody
  );
  res.json({ success: true, data });
});

const acceptSuggestedEventRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.acceptSuggestedEventRequest(req.auth, req.params.id);
  res.json({ success: true, data });
});

const reviseEventRequest = asyncHandler(async (req, res) => {
  const data = await eventRequestService.reviseEventRequest(
    req.auth,
    req.params.id,
    req.validatedBody
  );
  res.json({ success: true, data });
});

module.exports = {
  createEventRequest,
  assignAgronomistToRequest,
  listEventRequests,
  getEventRequest,
  approveEventRequest,
  rejectEventRequest,
  suggestEventRequestModification,
  acceptSuggestedEventRequest,
  reviseEventRequest,
};
