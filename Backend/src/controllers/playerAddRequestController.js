const asyncHandler = require('../utils/asyncHandler');
const clubManagementService = require('../services/clubManagementService');

const createRequest = asyncHandler(async (req, res) => {
  const data = await clubManagementService.createPlayerAddRequest(req.auth, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const listRequests = asyncHandler(async (req, res) => {
  const data = await clubManagementService.listPlayerAddRequests(req.auth);
  res.json({ success: true, data });
});

const approveRequest = asyncHandler(async (req, res) => {
  const data = await clubManagementService.approvePlayerAddRequest(req.auth, req.params.requestId);
  res.json({ success: true, data });
});

const rejectRequest = asyncHandler(async (req, res) => {
  const data = await clubManagementService.rejectPlayerAddRequest(req.auth, req.params.requestId);
  res.json({ success: true, data });
});

module.exports = { createRequest, listRequests, approveRequest, rejectRequest };
