const asyncHandler = require('../utils/asyncHandler');
const announcementService = require('../services/announcementService');

const createAnnouncement = asyncHandler(async (req, res) => {
  const data = await announcementService.createAnnouncement(req.auth, req.validatedBody);
  res.status(201).json({ success: true, data });
});

const listAnnouncements = asyncHandler(async (req, res) => {
  const data = await announcementService.listAnnouncements(req.auth);
  res.json({ success: true, data });
});

const getAnnouncement = asyncHandler(async (req, res) => {
  const data = await announcementService.getAnnouncement(req.auth, req.params.id);
  res.json({ success: true, data });
});

module.exports = {
  createAnnouncement,
  listAnnouncements,
  getAnnouncement,
};
