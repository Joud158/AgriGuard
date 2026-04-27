const asyncHandler = require('../utils/asyncHandler');
const cropDiagnosisService = require('../services/cropDiagnosisService');

const analyzeCrop = asyncHandler(async (req, res) => {
  const data = await cropDiagnosisService.analyzeCrop(req.auth, req.validatedBody);
  res.json({ success: true, data });
});

module.exports = { analyzeCrop };
