const { z } = require('zod');

const announcementAudienceTypes = ['all_coaches', 'all_players', 'all_users', 'team_players'];

const createAnnouncementSchema = z.object({
  audienceType: z.enum(announcementAudienceTypes, {
    errorMap: () => ({ message: 'Select a valid announcement audience.' }),
  }),
  teamId: z.string().trim().optional().or(z.literal('')),
  title: z.string().trim().min(2, 'Title is required.').max(100, 'Title is too long.'),
  message: z.string().trim().min(2, 'Message is required.').max(1000, 'Message is too long.'),
}).superRefine((value, ctx) => {
  if (value.audienceType === 'team_players' && !value.teamId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['teamId'],
      message: 'Team ID is required for specific team announcements.',
    });
  }
});

module.exports = {
  createAnnouncementSchema,
  announcementAudienceTypes,
};
