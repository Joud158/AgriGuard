const express = require('express');
const rateLimit = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validateBody = require('../middleware/validate');
const controller = require('../controllers/authController');
const {
  registerAdminSchema,
  loginSchema,
  verifyLoginMfaSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  inviteSchema,
  acceptInvitationSchema,
  updateUserRoleSchema,
  updateUserStatusSchema,
  verifyMfaSetupSchema,
  disableMfaSchema,
} = require('../validators/authSchemas');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

router.post('/register-admin', authLimiter, validateBody(registerAdminSchema), controller.registerAdmin);
router.get('/verify-email/:token', controller.verifyAdminEmail);
router.post('/login', authLimiter, validateBody(loginSchema), controller.login);
router.post('/login/verify-mfa', authLimiter, validateBody(verifyLoginMfaSchema), controller.verifyLoginMfa);
router.post('/forgot-password', authLimiter, validateBody(forgotPasswordSchema), controller.forgotPassword);
router.post('/reset-password/:token', authLimiter, validateBody(resetPasswordSchema), controller.resetPassword);
router.get('/me', authenticate, controller.me);
router.post('/invitations', authenticate, authorize('admin'), validateBody(inviteSchema), controller.inviteUser);
router.get('/invitations/:token', controller.getInvitation);
router.post('/accept-invitation/:token', authLimiter, validateBody(acceptInvitationSchema), controller.acceptInvitation);
router.get('/users', authenticate, authorize('admin'), controller.listUsers);
router.get('/teams', authenticate, authorize('admin'), controller.listTeams);
router.get('/admin-audit', authenticate, authorize('admin'), controller.getAdminAudit);
router.get('/my-history', authenticate, controller.getMyHistory);
router.patch('/users/:userId/role', authenticate, authorize('admin'), validateBody(updateUserRoleSchema), controller.updateUserRole);
router.patch('/users/:userId/status', authenticate, authorize('admin'), validateBody(updateUserStatusSchema), controller.updateUserStatus);
router.delete('/users/:userId', authenticate, authorize('admin'), controller.deleteUser);
router.post('/mfa/setup', authenticate, controller.beginMfaSetup);
router.post('/mfa/verify-setup', authenticate, validateBody(verifyMfaSetupSchema), controller.verifyMfaSetup);
router.post('/mfa/disable', authenticate, validateBody(disableMfaSchema), controller.disableMfa);

module.exports = router;
