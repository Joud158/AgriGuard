const asyncHandler = require('../utils/asyncHandler');
const clubManagementService = require('../services/clubManagementService');

const createPlayer = asyncHandler(async (req, res) => {
  const data = await clubManagementService.createPlayer(req.auth, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const listPlayers = asyncHandler(async (req, res) => {
  const data = await clubManagementService.listPlayers(req.auth);
  res.json({ success: true, data });
});

const getPlayer = asyncHandler(async (req, res) => {
  const data = await clubManagementService.getPlayer(req.auth, req.params.id);
  res.json({ success: true, data });
});

const updatePlayer = asyncHandler(async (req, res) => {
  const data = await clubManagementService.updatePlayer(req.auth, req.params.id, req.validatedBody);
  res.json({ success: true, data });
});

const transferPlayer = asyncHandler(async (req, res) => {
  const data = await clubManagementService.transferPlayer(req.auth, req.params.playerId, req.validatedBody);
  res.json({ success: true, data });
});

const createPlayerAttributes = asyncHandler(async (req, res) => {
  const data = await clubManagementService.createPlayerAttributes(req.auth, req.params.playerId, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const updatePlayerAttributes = asyncHandler(async (req, res) => {
  const data = await clubManagementService.updatePlayerAttributes(req.auth, req.params.playerId, req.validatedBody);
  res.json({ success: true, data });
});

const getPlayerAttributes = asyncHandler(async (req, res) => {
  const data = await clubManagementService.getPlayerAttributes(req.auth, req.params.playerId);
  res.json({ success: true, data });
});

module.exports = {
  createPlayer,
  listPlayers,
  getPlayer,
  updatePlayer,
  transferPlayer,
  createPlayerAttributes,
  updatePlayerAttributes,
  getPlayerAttributes,
};
