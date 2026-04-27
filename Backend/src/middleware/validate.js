function zodErrorToFieldMap(error) {
  const fieldErrors = {};
  for (const issue of error.issues || []) {
    const field = issue.path[0] || 'general';
    if (!fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: zodErrorToFieldMap(result.error),
      });
    }

    req.validatedBody = result.data;
    return next();
  };
}

module.exports = validateBody;
