const { z } = require('zod');

const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
const codeRegex = /^\d{6}$/;

const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .regex(
    passwordRegex,
    'Use at least 8 characters with uppercase, lowercase, number, and special character.'
  );

const optionalTeamIdField = z
  .string()
  .trim()
  .max(80, 'Team selection is invalid.')
  .optional()
  .or(z.literal(''));

const registerAdminSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required.').max(80, 'Full name is too long.'),
    email: z.string().trim().email('Please enter a valid email address.'),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm the password.'),
    clubName: z.string().trim().min(2, 'Club name is required.').max(80, 'Club name is too long.'),
    city: z.string().trim().min(2, 'City / location is required.').max(80, 'City is too long.'),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

const verifyLoginMfaSchema = z.object({
  challengeToken: z.string().min(1, 'Challenge token is required.'),
  code: z.string().trim().regex(codeRegex, 'Enter the 6-digit code from your authenticator app.'),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address.'),
});

const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm the password.'),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

const inviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required.').max(80, 'Full name is too long.'),
  email: z.string().trim().email('Please enter a valid email address.'),
  role: z.enum(['coach', 'player']),
  teamId: optionalTeamIdField,
});

const acceptInvitationSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Full name is required.').max(80, 'Full name is too long.'),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm the password.'),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmPassword'],
        message: 'Passwords do not match.',
      });
    }
  });

const updateUserRoleSchema = z.object({
  role: z.enum(['coach', 'player']),
  teamId: optionalTeamIdField,
});

const updateUserStatusSchema = z.object({
  isActive: z.boolean(),
});

const verifyMfaSetupSchema = z.object({
  code: z.string().trim().regex(codeRegex, 'Enter the 6-digit code from your authenticator app.'),
});

const disableMfaSchema = z.object({
  password: z.string().min(1, 'Password is required.'),
  code: z.string().trim().regex(codeRegex, 'Enter the 6-digit code from your authenticator app.'),
});

module.exports = {
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
};
