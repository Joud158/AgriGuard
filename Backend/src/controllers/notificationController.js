const asyncHandler = require('../utils/asyncHandler');
const notificationService = require('../services/notificationService');

const listNotifications = asyncHandler(async (req, res) => {
  const data = await notificationService.listNotifications(req.auth);
  res.json({ success: true, data });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const data = await notificationService.markNotificationRead(req.auth, req.params.id);
  res.json({ success: true, data });
});

module.exports = {
  listNotifications,
  markNotificationRead,
};
