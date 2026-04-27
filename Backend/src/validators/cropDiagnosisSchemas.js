const { z } = require('zod');

const cropDiagnosisSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, 'Ask a question about the crop image.')
    .max(1200, 'Question is too long.'),
  imageBase64: z
    .string()
    .trim()
    .min(10, 'Upload a crop or leaf image first.')
    .max(6_500_000, 'Image is too large.'),
  mimeType: z.string().trim().max(80, 'Image type is too long.').optional().default('image/jpeg'),
});

module.exports = { cropDiagnosisSchema };
