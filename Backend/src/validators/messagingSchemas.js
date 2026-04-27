const { z } = require('zod');

const optionalSocketId = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined);

const createDirectConversationSchema = z.object({
  targetUserId: z.string().trim().min(1, 'Please select a team member.'),
});

const createTeamConversationSchema = z.object({
  teamId: z.string().trim().min(1, 'Please select a team.'),
});

const createMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(2000, 'Message must be 2000 characters or less.'),
  socketId: optionalSocketId,
});

const authorizeConversationChannelSchema = z.object({
  socket_id: z.string().trim().min(1, 'Socket ID is required.'),
  channel_name: z.string().trim().min(1, 'Channel name is required.'),
});

module.exports = {
  createDirectConversationSchema,
  createTeamConversationSchema,
  createMessageSchema,
  authorizeConversationChannelSchema,
};
