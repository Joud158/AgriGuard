const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/playerController');
const {
  createPlayerSchema,
  updatePlayerSchema,
  transferPlayerSchema,
  createPlayerAttributesSchema,
  updatePlayerAttributesSchema,
} = require('../validators/clubManagementSchemas');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .post(authorize('admin'), validateBody(createPlayerSchema), controller.createPlayer)
  .get(controller.listPlayers);

router.post('/:playerId/transfer', authorize('admin'), validateBody(transferPlayerSchema), controller.transferPlayer);

router
  .route('/:playerId/attributes')
  .post(authorize('admin', 'coach'), validateBody(createPlayerAttributesSchema), controller.createPlayerAttributes)
  .patch(authorize('admin', 'coach'), validateBody(updatePlayerAttributesSchema), controller.updatePlayerAttributes)
  .get(controller.getPlayerAttributes);

router
  .route('/:id')
  .get(controller.getPlayer)
  .patch(authorize('admin', 'coach'), validateBody(updatePlayerSchema), controller.updatePlayer);

module.exports = router;
