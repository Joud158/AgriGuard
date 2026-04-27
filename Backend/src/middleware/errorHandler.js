const { logError } = require('../utils/logger');

function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    message: 'Route not found.',
  });
}

function errorHandler(error, req, res, next) {
  const statusCode = error.statusCode || 500;
  logError(error.message, { path: req.path, method: req.method });
  const shouldMaskMessage = statusCode >= 500 && statusCode !== 502 && statusCode !== 503;

  const payload = {
    success: false,
    message: shouldMaskMessage ? 'Internal server error.' : error.message,
  };

  if (error.errors) {
    payload.errors = error.errors;
  }

  res.status(statusCode).json(payload);
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
