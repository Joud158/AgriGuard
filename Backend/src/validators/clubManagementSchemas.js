const { z } = require('zod');

function optionalIdField() {
  return z.preprocess(
    (value) => {
      if (value === '') return null;
      return value;
    },
    z.string().trim().min(1, 'Value is required.').nullable().optional()
  );
}

function optionalPositionField() {
  return z.preprocess(
    (value) => {
      if (value === null || value === undefined) return '';
      return value;
    },
    z.string().trim().max(50, 'Preferred position is too long.')
  );
}

const coordinatePairSchema = z
  .tuple([
    z.number({ invalid_type_error: 'Longitude must be a number.' }).min(-180).max(180),
    z.number({ invalid_type_error: 'Latitude must be a number.' }).min(-90).max(90),
  ]);

const fieldBboxSchema = z
  .tuple([
    z.number({ invalid_type_error: 'Minimum longitude must be a number.' }).min(-180).max(180),
    z.number({ invalid_type_error: 'Minimum latitude must be a number.' }).min(-90).max(90),
    z.number({ invalid_type_error: 'Maximum longitude must be a number.' }).min(-180).max(180),
    z.number({ invalid_type_error: 'Maximum latitude must be a number.' }).min(-90).max(90),
  ])
  .refine((bbox) => bbox[0] < bbox[2] && bbox[1] < bbox[3], {
    message: 'Field boundary box is invalid.',
  });

const fieldGeometrySchema = z
  .object({
    type: z.literal('Polygon'),
    coordinates: z
      .array(z.array(coordinatePairSchema).min(4, 'Draw at least 3 field corners.'))
      .min(1, 'Field polygon is required.'),
  })
  .refine((geometry) => geometry.coordinates[0]?.length >= 4, {
    message: 'Draw at least 3 field corners.',
    path: ['coordinates'],
  });

const optionalFieldBboxSchema = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  fieldBboxSchema.optional()
);

const optionalFieldGeometrySchema = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  fieldGeometrySchema.optional()
);

const scoreSchema = z
  .number({
    invalid_type_error: 'Score must be a number.',
    required_error: 'Score is required.',
  })
  .int('Score must be a whole number.')
  .min(0, 'Score must be at least 0.')
  .max(100, 'Score must be at most 100.');

const createTeamSchema = z
  .object({
    name: z.string().trim().min(2, 'Field name is required.').max(80, 'Field name is too long.'),
    crop: z.string().trim().max(80, 'Crop name is too long.').optional().default(''),
    coachUserId: optionalIdField(),
    fieldBbox: fieldBboxSchema.optional(),
    fieldGeometry: fieldGeometrySchema.optional(),
    bbox: fieldBboxSchema.optional(),
    geometry: fieldGeometrySchema.optional(),
    satelliteBbox: fieldBboxSchema.optional(),
    satelliteGeometry: fieldGeometrySchema.optional(),
    boundaryBbox: fieldBboxSchema.optional(),
    boundaryGeometry: fieldGeometrySchema.optional(),
  })
  .refine((data) => Boolean(
    (data.fieldBbox || data.bbox || data.satelliteBbox || data.boundaryBbox || data.fieldGeometry || data.geometry || data.satelliteGeometry || data.boundaryGeometry)
  ), {
    message: 'Draw the field boundary on the map before saving.',
    path: ['fieldGeometry'],
  });

const updateTeamSchema = z
  .object({
    name: z.string().trim().min(2, 'Field name is required.').max(80, 'Field name is too long.').optional(),
    crop: z.string().trim().max(80, 'Crop name is too long.').optional(),
    coachUserId: optionalIdField(),
    fieldBbox: optionalFieldBboxSchema,
    fieldGeometry: optionalFieldGeometrySchema,
    bbox: optionalFieldBboxSchema,
    geometry: optionalFieldGeometrySchema,
    satelliteBbox: optionalFieldBboxSchema,
    satelliteGeometry: optionalFieldGeometrySchema,
    boundaryBbox: optionalFieldBboxSchema,
    boundaryGeometry: optionalFieldGeometrySchema,
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.crop !== undefined ||
      Object.prototype.hasOwnProperty.call(data, 'coachUserId') ||
      data.fieldBbox !== undefined ||
      data.fieldGeometry !== undefined ||
      data.bbox !== undefined ||
      data.geometry !== undefined ||
      data.satelliteBbox !== undefined ||
      data.satelliteGeometry !== undefined ||
      data.boundaryBbox !== undefined ||
      data.boundaryGeometry !== undefined,
    {
      message: 'At least one field must be provided.',
      path: ['name'],
    }
  );


const updateTeamBoundarySchema = z
  .object({
    name: z.string().trim().min(2, 'Field name is required.').max(80, 'Field name is too long.').optional(),
    crop: z.string().trim().max(80, 'Crop name is too long.').optional(),
    fieldBbox: optionalFieldBboxSchema,
    field_bbox: optionalFieldBboxSchema,
    bbox: optionalFieldBboxSchema,
    satelliteBbox: optionalFieldBboxSchema,
    satellite_bbox: optionalFieldBboxSchema,
    boundaryBbox: optionalFieldBboxSchema,
    boundary_bbox: optionalFieldBboxSchema,
    fieldGeometry: optionalFieldGeometrySchema,
    field_geometry: optionalFieldGeometrySchema,
    geometry: optionalFieldGeometrySchema,
    satelliteGeometry: optionalFieldGeometrySchema,
    satellite_geometry: optionalFieldGeometrySchema,
    boundaryGeometry: optionalFieldGeometrySchema,
    boundary_geometry: optionalFieldGeometrySchema,
    boundary: z
      .object({
        fieldBbox: optionalFieldBboxSchema,
        field_bbox: optionalFieldBboxSchema,
        bbox: optionalFieldBboxSchema,
        fieldGeometry: optionalFieldGeometrySchema,
        field_geometry: optionalFieldGeometrySchema,
        geometry: optionalFieldGeometrySchema,
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine(
    (data) =>
      data.fieldBbox !== undefined ||
      data.field_bbox !== undefined ||
      data.bbox !== undefined ||
      data.satelliteBbox !== undefined ||
      data.satellite_bbox !== undefined ||
      data.boundaryBbox !== undefined ||
      data.boundary_bbox !== undefined ||
      data.fieldGeometry !== undefined ||
      data.field_geometry !== undefined ||
      data.geometry !== undefined ||
      data.satelliteGeometry !== undefined ||
      data.satellite_geometry !== undefined ||
      data.boundaryGeometry !== undefined ||
      data.boundary_geometry !== undefined ||
      data.boundary?.fieldBbox !== undefined ||
      data.boundary?.field_bbox !== undefined ||
      data.boundary?.bbox !== undefined ||
      data.boundary?.fieldGeometry !== undefined ||
      data.boundary?.field_geometry !== undefined ||
      data.boundary?.geometry !== undefined,
    {
      message: 'Draw the field boundary on the map before saving.',
      path: ['fieldGeometry'],
    }
  );

const createPlayerSchema = z.object({
  userId: z.string().trim().min(1, 'Player user is required.'),
  jerseyNumber: z
    .number({
      invalid_type_error: 'Jersey number must be a number.',
      required_error: 'Jersey number is required.',
    })
    .int('Jersey number must be a whole number.')
    .min(0, 'Jersey number must be at least 0.')
    .max(999, 'Jersey number is too large.'),
  preferredPosition: optionalPositionField(),
});

const updatePlayerSchema = z
  .object({
    jerseyNumber: z
      .number({
        invalid_type_error: 'Jersey number must be a number.',
      })
      .int('Jersey number must be a whole number.')
      .min(0, 'Jersey number must be at least 0.')
      .max(999, 'Jersey number is too large.')
      .optional(),
    preferredPosition: optionalPositionField().optional(),
  })
  .refine((data) => data.jerseyNumber !== undefined || data.preferredPosition !== undefined, {
    message: 'At least one field must be provided.',
    path: ['jerseyNumber'],
  });

const addPlayerToTeamSchema = z.object({
  playerId: z.string().trim().min(1, 'Player is required.'),
});

const createPlayerAddRequestSchema = z.object({
  playerId: z.string().trim().min(1, 'Player is required.'),
  teamId: z.string().trim().min(1, 'Team is required.'),
  requestType: z.enum(['add', 'remove']).optional().default('add'),
});

const transferPlayerSchema = z.object({
  targetTeamId: z.string().trim().min(1, 'Target team is required.'),
});

const createPlayerAttributesSchema = z.object({
  attackScore: scoreSchema,
  defenseScore: scoreSchema,
  serveScore: scoreSchema,
  blockScore: scoreSchema,
  staminaScore: scoreSchema,
  preferredPosition: optionalPositionField(),
});

const updatePlayerAttributesSchema = z
  .object({
    attackScore: scoreSchema.optional(),
    defenseScore: scoreSchema.optional(),
    serveScore: scoreSchema.optional(),
    blockScore: scoreSchema.optional(),
    staminaScore: scoreSchema.optional(),
    preferredPosition: optionalPositionField().optional(),
  })
  .refine(
    (data) =>
      data.attackScore !== undefined ||
      data.defenseScore !== undefined ||
      data.serveScore !== undefined ||
      data.blockScore !== undefined ||
      data.staminaScore !== undefined ||
      data.preferredPosition !== undefined,
    {
      message: 'At least one field must be provided.',
      path: ['attackScore'],
    }
  );

module.exports = {
  createTeamSchema,
  updateTeamSchema,
  updateTeamBoundarySchema,
  createPlayerSchema,
  updatePlayerSchema,
  addPlayerToTeamSchema,
  createPlayerAddRequestSchema,
  transferPlayerSchema,
  createPlayerAttributesSchema,
  updatePlayerAttributesSchema,
};
