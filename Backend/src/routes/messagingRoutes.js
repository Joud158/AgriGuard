const express = require('express');
const authenticate = require('../middleware/authenticate');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/messagingController');
const {
  createDirectConversationSchema,
  createTeamConversationSchema,
  createMessageSchema,
  authorizeConversationChannelSchema,
} = require('../validators/messagingSchemas');

const router = express.Router();

router.use(authenticate);

router.get('/', controller.listConversations);
router.post('/direct', validateBody(createDirectConversationSchema), controller.createDirectConversation);
router.post('/team', validateBody(createTeamConversationSchema), controller.createTeamConversation);
router.post('/pusher/auth', validateBody(authorizeConversationChannelSchema), controller.authorizeConversationChannel);
router.get('/:id/messages', controller.getConversationMessages);
router.post('/:id/messages', validateBody(createMessageSchema), controller.createMessage);

module.exports = router;
