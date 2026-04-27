const asyncHandler = require('../utils/asyncHandler');
const authService = require('../services/authService');

const registerAdmin = asyncHandler(async (req, res) => {
  const data = await authService.registerAdmin(req.validatedBody);
  res.status(201).json({ success: true, data });
});

const verifyAdminEmail = asyncHandler(async (req, res) => {
  const data = await authService.verifyAdminEmail(req.params.token);
  res.json({ success: true, data });
});

const login = asyncHandler(async (req, res) => {
  const data = await authService.login(req.validatedBody);
  res.json({ success: true, data });
});

const verifyLoginMfa = asyncHandler(async (req, res) => {
  const data = await authService.verifyLoginMfa(req.validatedBody);
  res.json({ success: true, data });
});

const forgotPassword = asyncHandler(async (req, res) => {
  const data = await authService.forgotPassword(req.validatedBody, req.get('origin'));
  res.json({ success: true, data });
});

const resetPassword = asyncHandler(async (req, res) => {
  const data = await authService.resetPassword(req.params.token, req.validatedBody);
  res.json({ success: true, data });
});

const me = asyncHandler(async (req, res) => {
  const data = await authService.getCurrentUser(req.auth.id);
  res.json({ success: true, data });
});

const inviteUser = asyncHandler(async (req, res) => {
  const origin = req.get('origin');
  const data = await authService.inviteUser(req.auth, req.validatedBody, origin);
  res.status(201).json({ success: true, data });
});

const getInvitation = asyncHandler(async (req, res) => {
  const data = await authService.getInvitation(req.params.token);
  res.json({ success: true, data });
});

const acceptInvitation = asyncHandler(async (req, res) => {
  const data = await authService.acceptInvitation(req.params.token, req.validatedBody);
  res.json({ success: true, data });
});

const listUsers = asyncHandler(async (req, res) => {
  const data = await authService.listUsers(req.auth, req.query.q || '');
  res.json({ success: true, data });
});

const listTeams = asyncHandler(async (req, res) => {
  const data = await authService.listTeams(req.auth);
  res.json({ success: true, data });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const data = await authService.updateUserRole(req.auth, req.params.userId, req.validatedBody);
  res.json({ success: true, data });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const data = await authService.updateUserStatus(req.auth, req.params.userId, req.validatedBody);
  res.json({ success: true, data });
});

const deleteUser = asyncHandler(async (req, res) => {
  const data = await authService.deleteUser(req.auth, req.params.userId);
  res.json({ success: true, data });
});

const getAdminAudit = asyncHandler(async (req, res) => {
  const data = await authService.getAdminAudit(req.auth);
  res.json({ success: true, data });
});

const getMyHistory = asyncHandler(async (req, res) => {
  const data = await authService.getMyHistory(req.auth);
  res.json({ success: true, data });
});

const beginMfaSetup = asyncHandler(async (req, res) => {
  const data = await authService.beginMfaSetup(req.auth);
  res.json({ success: true, data });
});

const verifyMfaSetup = asyncHandler(async (req, res) => {
  const data = await authService.verifyMfaSetup(req.auth, req.validatedBody);
  res.json({ success: true, data });
});

const disableMfa = asyncHandler(async (req, res) => {
  const data = await authService.disableMfa(req.auth, req.validatedBody);
  res.json({ success: true, data });
});

module.exports = {
  registerAdmin,
  verifyAdminEmail,
  login,
  verifyLoginMfa,
  forgotPassword,
  resetPassword,
  me,
  inviteUser,
  getInvitation,
  acceptInvitation,
  listUsers,
  updateUserRole,
  updateUserStatus,
  deleteUser,
  getAdminAudit,
  getMyHistory,
  listTeams,
  beginMfaSetup,
  verifyMfaSetup,
  disableMfa,
};
