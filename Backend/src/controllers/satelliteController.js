const asyncHandler = require('../utils/asyncHandler');
const satelliteService = require('../services/satelliteService');

const getSatelliteAnalytics = asyncHandler(async (req, res) => {
  const data = await satelliteService.getSatelliteAnalytics(req.auth);
  res.json({ success: true, data });
});

module.exports = {
  getSatelliteAnalytics,
};
