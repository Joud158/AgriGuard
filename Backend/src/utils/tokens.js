const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      email: user.email,
      club_id: user.club_id || null,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtSecret);
}

function createScopedToken(subject, purpose, expiresIn, extra = {}) {
  return jwt.sign(
    {
      sub: subject,
      purpose,
      ...extra,
    },
    env.jwtSecret,
    { expiresIn }
  );
}

function verifyScopedToken(token, expectedPurpose) {
  const payload = jwt.verify(token, env.jwtSecret);
  if (payload.purpose !== expectedPurpose) {
    throw new Error('Invalid token purpose.');
  }
  return payload;
}

function createRawInvitationToken() {
  return crypto.randomBytes(24).toString('hex');
}

function createRawPasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function createRawEmailVerificationToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashInvitationToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function hashPasswordResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function hashEmailVerificationToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

module.exports = {
  createAccessToken,
  verifyAccessToken,
  createScopedToken,
  verifyScopedToken,
  createRawInvitationToken,
  createRawPasswordResetToken,
  createRawEmailVerificationToken,
  hashInvitationToken,
  hashPasswordResetToken,
  hashEmailVerificationToken,
};
