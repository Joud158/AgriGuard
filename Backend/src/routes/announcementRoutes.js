const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/announcementController');
const { createAnnouncementSchema } = require('../validators/announcementSchemas');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .post(authorize('admin'), validateBody(createAnnouncementSchema), controller.createAnnouncement)
  .get(controller.listAnnouncements);

router.get('/:id', controller.getAnnouncement);

module.exports = router;
