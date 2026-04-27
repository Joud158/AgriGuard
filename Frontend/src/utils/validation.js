function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function requireText(errors, field, value, message) {
  if (!String(value || '').trim()) errors[field] = message;
}

function validatePasswordPair(errors, password, confirmPassword) {
  if (!password || password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (password !== confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }
}

export function validateLogin(values) {
  const errors = {};
  if (!isEmail(values.email)) errors.email = 'Enter a valid email address.';
  requireText(errors, 'password', values.password, 'Password is required.');
  return errors;
}

export function validateAdminSignup(values) {
  const errors = {};
  requireText(errors, 'fullName', values.fullName, 'Full name is required.');
  if (!isEmail(values.email)) errors.email = 'Enter a valid email address.';
  validatePasswordPair(errors, values.password, values.confirmPassword);
  requireText(errors, 'clubName', values.clubName, 'Farm network name is required.');
  requireText(errors, 'city', values.city, 'City or location is required.');
  return errors;
}

export function validateAcceptInvitation(values) {
  const errors = {};
  requireText(errors, 'fullName', values.fullName, 'Full name is required.');
  validatePasswordPair(errors, values.password, values.confirmPassword);
  return errors;
}

export function validateInvite(values) {
  const errors = {};
  requireText(errors, 'fullName', values.fullName, 'Full name is required.');
  if (!isEmail(values.email)) errors.email = 'Enter a valid email address.';
  if (!['coach', 'player'].includes(values.role)) errors.role = 'Choose Agronomist or Farmer.';
  return errors;
}

export function validateTeam(values) {
  const errors = {};
  requireText(errors, 'name', values.name, 'Field name is required.');
  if (String(values.name || '').trim().length > 100) errors.name = 'Field name is too long.';
  return errors;
}

export function validateEvent(values) {
  const errors = {};
  requireText(errors, 'title', values.title, 'Title is required.');
  if (!['training', 'match', 'meeting', 'other'].includes(values.type)) {
    errors.type = 'Choose field scouting, field visit, advisory meeting, or other.';
  }
  requireText(errors, 'teamId', values.teamId, 'Field is required.');
  requireText(errors, 'startTime', values.startTime, 'Start date and time are required.');
  requireText(errors, 'endTime', values.endTime, 'End date and time are required.');
  if (values.startTime && values.endTime && new Date(values.endTime) <= new Date(values.startTime)) {
    errors.endTime = 'End time must be after start time.';
  }
  return errors;
}
