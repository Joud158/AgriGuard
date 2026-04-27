const asyncHandler = require('../utils/asyncHandler');
const clubManagementService = require('../services/clubManagementService');

const createTeam = asyncHandler(async (req, res) => {
  const data = await clubManagementService.createTeam(req.auth, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const listTeams = asyncHandler(async (req, res) => {
  const data = await clubManagementService.listTeams(req.auth);
  res.json({ success: true, data });
});

const getTeamsSummary = asyncHandler(async (req, res) => {
  const data = await clubManagementService.getTeamsSummary(req.auth);
  res.json({ success: true, data });
});

const getTeam = asyncHandler(async (req, res) => {
  const data = await clubManagementService.getTeam(req.auth, req.params.id);
  res.json({ success: true, data });
});

const updateTeam = asyncHandler(async (req, res) => {
  const data = await clubManagementService.updateTeam(req.auth, req.params.id, req.validatedBody);
  res.json({ success: true, data });
});


const updateTeamBoundary = asyncHandler(async (req, res) => {
  const data = await clubManagementService.updateTeamBoundary(req.auth, req.params.id, req.validatedBody || req.body);
  res.json({ success: true, data });
});

const deleteTeam = asyncHandler(async (req, res) => {
  const data = await clubManagementService.deleteTeam(req.auth, req.params.id);
  res.json({ success: true, data });
});

const addPlayerToTeam = asyncHandler(async (req, res) => {
  const data = await clubManagementService.addPlayerToTeam(req.auth, req.params.teamId, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const removePlayerFromTeam = asyncHandler(async (req, res) => {
  const data = await clubManagementService.removePlayerFromTeam(req.auth, req.params.teamId, req.params.playerId);
  res.json({ success: true, data });
});

module.exports = {
  createTeam,
  listTeams,
  getTeamsSummary,
  getTeam,
  updateTeam,
  updateTeamBoundary,
  deleteTeam,
  addPlayerToTeam,
  removePlayerFromTeam,
};
