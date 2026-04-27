const { z } = require('zod');
const eventTypeEnum=z.enum(['training','match', 'meeting', 'other'], {
    errorMap: () => ({ message: 'Event type must be one of field scouting, agronomist visit, advisory meeting, or other' }),
});

const createEventSchema = z.object({
    title: z.string().trim().min(2, 'Title is required.').max(100, 'Title is too long.'),
    type: eventTypeEnum,
    teamId: z.string().trim().min(1, 'Team ID is required.'),
    description: z.string().trim().max(500, 'Description is too long.').optional().default(''),
    location: z.string().trim().max(200, 'Location is too long.').optional().default(''),
    startTime: z.string().trim().min(1, 'Start time is required.').datetime({ message: 'Start time must be a valid ISO datetime.' }),
    endTime: z.string().trim().min(1, 'End time is required.').datetime({ message: 'End time must be a valid ISO datetime.' }),
  })
  .refine((data) => new Date(data.endTime) > new Date(data.startTime), {
    message: 'End time must be after start time.',
    path: ['endTime'],
  });

const updateEventSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required.').max(100, 'Title is too long.').optional(),
    type: eventTypeEnum.optional(),
    teamId: z.string().trim().min(1, 'Team is required.').optional(),
    description: z.string().trim().max(500, 'Description is too long.').optional(),
    location: z.string().trim().max(200, 'Location is too long.').optional(),
    startTime: z.string().trim().datetime({ message: 'Start time must be a valid ISO datetime.' }).optional(),
    endTime: z.string().trim().datetime({ message: 'End time must be a valid ISO datetime.' }).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
    path: ['title'],
  })
  .refine(
    (data) => {
      if (data.startTime && data.endTime) {
        return new Date(data.endTime) > new Date(data.startTime);
      }
      return true;
    },
    {
      message: 'End time must be after start time.',
      path: ['endTime'],
    }
  );

const transcribeEventAudioSchema = z.object({
  audioBase64: z.string().trim().min(1, 'Audio data is required.'),
  mimeType: z.string().trim().min(1, 'Audio type is required.'),
  fileName: z.string().trim().max(120, 'File name is too long.').optional(),
  language: z
    .string()
    .trim()
    .regex(/^[A-Za-z-]{2,12}$/, 'Language must be a valid language code.')
    .optional(),
});

const parseVoiceTranscriptSchema = z.object({
  transcript: z.string().trim().min(3, 'Transcript is too short.').max(4000, 'Transcript is too long.'),
  timezone: z.string().trim().max(64, 'Timezone is too long.').optional(),
  referenceDate: z
    .string()
    .trim()
    .datetime({ message: 'Reference date must be a valid ISO datetime.' })
    .optional(),
  teams: z
    .array(
      z.object({
        id: z.string().trim().min(1, 'Team id is required.'),
        name: z.string().trim().min(1, 'Team name is required.').max(100, 'Team name is too long.'),
      }),
      { invalid_type_error: 'Teams must be an array.' }
    )
    .max(40, 'Too many teams provided.')
    .optional(),
});
  
module.exports = {
  createEventSchema,
  updateEventSchema,
  transcribeEventAudioSchema,
  parseVoiceTranscriptSchema,
};
