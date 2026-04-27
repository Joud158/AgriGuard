const { z } = require('zod');

const eventTypeEnum = z.enum(['training', 'match', 'meeting', 'other'], {
  errorMap: () => ({
    message: 'Event type must be one of field scouting, agronomist visit, advisory meeting, or other',
  }),
});

const optionalComment = z
  .string()
  .trim()
  .max(500, 'Comment is too long.')
  .optional()
  .transform((value) => value || '');

const optionalReason = z
  .string()
  .trim()
  .max(500, 'Reason is too long.')
  .optional()
  .transform((value) => value || '');

const eventRequestPayloadFields = z.object({
  title: z.string().trim().min(2, 'Title is required.').max(100, 'Title is too long.'),
  type: eventTypeEnum,
  teamId: z.string().trim().min(1, 'Team ID is required.'),
  sourceEventId: z.string().trim().optional().transform((value) => value || ''),
  location: z.string().trim().max(200, 'Location is too long.').optional().default(''),
  notes: z.string().trim().max(500, 'Notes are too long.').optional().default(''),
  startTime: z
    .string()
    .trim()
    .min(1, 'Start time is required.')
    .datetime({ message: 'Start time must be a valid ISO datetime.' }),
  endTime: z
    .string()
    .trim()
    .min(1, 'End time is required.')
    .datetime({ message: 'End time must be a valid ISO datetime.' }),
  comment: optionalComment,
});

const requestPayloadSchema = eventRequestPayloadFields.refine(
  (data) => new Date(data.endTime) > new Date(data.startTime),
  {
    message: 'End time must be after start time.',
    path: ['endTime'],
  }
);

const revisionPayloadSchema = eventRequestPayloadFields
  .omit({ teamId: true })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: 'End time must be after start time.',
    path: ['endTime'],
  });

const rejectEventRequestSchema = z.object({
  reason: optionalReason,
});

module.exports = {
  createEventRequestSchema: requestPayloadSchema,
  suggestEventRequestSchema: revisionPayloadSchema,
  reviseEventRequestSchema: revisionPayloadSchema,
  rejectEventRequestSchema,
};
