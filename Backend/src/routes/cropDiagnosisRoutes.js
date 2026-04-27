const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/cropDiagnosisController');
const { cropDiagnosisSchema } = require('../validators/cropDiagnosisSchemas');

const router = express.Router();

router.use(authenticate);

// Only farmers can upload crop/leaf images for AI diagnosis.
router.post('/analyze', authorize('player'), validateBody(cropDiagnosisSchema), controller.analyzeCrop);

module.exports = router;
