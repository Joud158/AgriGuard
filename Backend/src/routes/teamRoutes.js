const express = require('express');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/teamController');
const {
  createTeamSchema,
  updateTeamSchema,
  updateTeamBoundarySchema,
  addPlayerToTeamSchema,
} = require('../validators/clubManagementSchemas');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .post(authorize('admin'), validateBody(createTeamSchema), controller.createTeam)
  .get(controller.listTeams);

router.get('/summary', controller.getTeamsSummary);
router.post('/:teamId/players', authorize('admin'), validateBody(addPlayerToTeamSchema), controller.addPlayerToTeam);
router.delete('/:teamId/players/:playerId', authorize('admin'), controller.removePlayerFromTeam);
router.patch('/:id/boundary', authorize('admin'), validateBody(updateTeamBoundarySchema), controller.updateTeamBoundary);

router
  .route('/:id')
  .get(controller.getTeam)
  .patch(authorize('admin'), validateBody(updateTeamSchema), controller.updateTeam)
  .delete(authorize('admin'), controller.deleteTeam);

module.exports = router;
