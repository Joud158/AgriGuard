const asyncHandler = require('../utils/asyncHandler');
const messagingService = require('../services/messagingService');

const listConversations = asyncHandler(async (req, res) => {
  const data = await messagingService.listConversations(req.auth);
  res.json({ success: true, data });
});

const getConversationMessages = asyncHandler(async (req, res) => {
  const data = await messagingService.getConversationMessages(req.auth, req.params.id);
  res.json({ success: true, data });
});

const createDirectConversation = asyncHandler(async (req, res) => {
  const result = await messagingService.createDirectConversation(req.auth, req.validatedBody);
  res.status(result.created ? 201 : 200).json({ success: true, data: result.conversation });
});

const createTeamConversation = asyncHandler(async (req, res) => {
  const result = await messagingService.createTeamConversation(req.auth, req.validatedBody);
  res.status(result.created ? 201 : 200).json({ success: true, data: result.conversation });
});

const createMessage = asyncHandler(async (req, res) => {
  const data = await messagingService.createMessage(req.auth, req.params.id, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const authorizeConversationChannel = asyncHandler(async (req, res) => {
  const data = await messagingService.authorizeConversationSubscription(req.auth, req.validatedBody);
  res.json(data);
});

module.exports = {
  listConversations,
  getConversationMessages,
  createDirectConversation,
  createTeamConversation,
  createMessage,
  authorizeConversationChannel,
};
