export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const AUTH_STORAGE_KEY = 'agriguard-session';
const LOGIN_NOTICE_KEY = 'agriguard-login-notice';
const INVALID_SESSION_MESSAGES = new Set([
  'Authentication required.',
  'Invalid or expired token.',
  'This login session is no longer valid. Please sign in again.',
]);

function redirectToLogin(message) {
  if (typeof window === 'undefined') {
    return;
  }

  localStorage.removeItem(AUTH_STORAGE_KEY);

  if (message) {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, message);
  }

  if (window.location.pathname !== '/login') {
    window.location.replace('/login');
  }
}

async function request(path, options = {}) {
  const mergedHeaders = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: mergedHeaders,
    });
  } catch {
    return {
      success: false,
      message: 'Could not reach the server. Make sure the backend is running.',
    };
  }

  const data = await response.json().catch(() => ({
    success: false,
    message: 'The server returned an invalid response.',
  }));

  if (options.redirectOnUnauthorized !== false && response.status === 401 && INVALID_SESSION_MESSAGES.has(data.message)) {
    redirectToLogin('Your session expired. Please log in again.');
  }

  return data;
}

export function getSessionToken() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw).token;
  } catch {
    return null;
  }
}

function authHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function login(payload) {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyLoginMfa(payload) {
  return request('/auth/login/verify-mfa', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function forgotPassword(payload) {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resetPassword(token, payload) {
  return request(`/auth/reset-password/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function registerAdmin(payload) {
  return request('/auth/register-admin', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyAdminEmail(token) {
  return request(`/auth/verify-email/${encodeURIComponent(token)}`);
}

export async function getInvitation(token) {
  return request(`/auth/invitations/${encodeURIComponent(token)}`);
}

export async function acceptInvitation(token, payload) {
  return request(`/auth/accept-invitation/${encodeURIComponent(token)}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function inviteUser(payload) {
  return request('/auth/invitations', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getUsers(query = '') {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
  return request(`/auth/users${suffix}`, {
    headers: authHeaders(),
  });
}

export async function updateUserRole(userId, payload) {
  return request(`/auth/users/${encodeURIComponent(userId)}/role`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteUser(userId) {
  return request(`/auth/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function getMe() {
  return request('/auth/me', {
    headers: authHeaders(),
  });
}

export async function beginMfaSetup() {
  return request('/auth/mfa/setup', {
    method: 'POST',
    headers: authHeaders(),
  });
}

export async function verifyMfaSetup(payload) {
  return request('/auth/mfa/verify-setup', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function disableMfa(payload) {
  return request('/auth/mfa/disable', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getTeams() {
  return request('/teams', {
    headers: authHeaders(),
  });
}

export async function getTeamsSummary() {
  return request('/teams/summary', {
    headers: authHeaders(),
  });
}

export async function getTeam(teamId) {
  return request(`/teams/${encodeURIComponent(teamId)}`, {
    headers: authHeaders(),
  });
}

export async function createTeam(payload) {
  return request('/teams', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateTeam(teamId, payload) {
  return request(`/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}


export async function updateTeamBoundary(teamId, payload) {
  return request(`/teams/${encodeURIComponent(teamId)}/boundary`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteTeam(teamId) {
  return request(`/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function getPlayers() {
  return request('/players', {
    headers: authHeaders(),
  });
}

export async function updatePlayer(playerId, payload) {
  return request(`/players/${encodeURIComponent(playerId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getPlayerAttributes(playerId) {
  return request(`/players/${encodeURIComponent(playerId)}/attributes`, {
    headers: authHeaders(),
  });
}

export async function updatePlayerAttributes(playerId, payload) {
  return request(`/players/${encodeURIComponent(playerId)}/attributes`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function addPlayerToTeam(teamId, payload) {
  return request(`/teams/${encodeURIComponent(teamId)}/players`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function removePlayerFromTeam(teamId, playerId) {
  return request(`/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}

export async function createPlayerAddRequest(payload) {
  return request('/player-add-requests', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getPlayerAddRequests() {
  return request('/player-add-requests', {
    headers: authHeaders(),
  });
}

export async function approvePlayerAddRequest(requestId) {
  return request(`/player-add-requests/${encodeURIComponent(requestId)}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function rejectPlayerAddRequest(requestId) {
  return request(`/player-add-requests/${encodeURIComponent(requestId)}/reject`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function getEvents() {
  return request('/events', {
    headers: authHeaders(),
  });
}

export async function getAnnouncements() {
  return request('/announcements', {
    headers: authHeaders(),
  });
}

export async function getNotifications() {
  return request('/notifications', {
    headers: authHeaders(),
    redirectOnUnauthorized: false,
  });
}

export async function getConversations() {
  return request('/conversations', {
    headers: authHeaders(),
    redirectOnUnauthorized: false,
  });
}

export async function getConversationMessages(conversationId) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    headers: authHeaders(),
    redirectOnUnauthorized: false,
  });
}

export async function createDirectConversation(payload) {
  return request('/conversations/direct', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    redirectOnUnauthorized: false,
  });
}

export async function createTeamConversation(payload) {
  return request('/conversations/team', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    redirectOnUnauthorized: false,
  });
}

export async function sendConversationMessage(conversationId, payload) {
  return request(`/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
    redirectOnUnauthorized: false,
  });
}

export async function markNotificationRead(notificationId) {
  return request(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function getAnnouncement(announcementId) {
  return request(`/announcements/${encodeURIComponent(announcementId)}`, {
    headers: authHeaders(),
  });
}

export async function createAnnouncement(payload) {
  return request('/announcements', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getEvent(eventId) {
  return request(`/events/${encodeURIComponent(eventId)}`, {
    headers: authHeaders(),
  });
}

export async function getEventOverlaps({ startTime, endTime, teamId = '', excludeEventId = '' }) {
  const params = new URLSearchParams();
  if (startTime) params.set('startTime', startTime);
  if (endTime) params.set('endTime', endTime);
  if (teamId) params.set('teamId', teamId);
  if (excludeEventId) params.set('excludeEventId', excludeEventId);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  return request(`/events/overlaps${suffix}`, {
    headers: authHeaders(),
  });
}

export async function getEventRequests() {
  return request('/event-requests', {
    headers: authHeaders(),
  });
}

export async function getEventRequest(eventRequestId) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}`, {
    headers: authHeaders(),
  });
}

export async function createEventRequest(payload) {
  return request('/event-requests', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}


export async function assignEventRequestAgronomist(eventRequestId, payload) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}/assign-agronomist`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function approveEventRequest(eventRequestId) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}/approve`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function rejectEventRequest(eventRequestId, payload) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}/reject`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function suggestEventRequestModification(eventRequestId, payload) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}/suggest-modification`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function acceptEventRequestSuggestion(eventRequestId) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}/accept-suggestion`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
}

export async function reviseEventRequest(eventRequestId, payload) {
  return request(`/event-requests/${encodeURIComponent(eventRequestId)}/revise`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function createEvent(payload) {
  return request('/events', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function transcribeEventAudio(payload) {
  return request('/events/voice/transcribe', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function parseEventVoiceTranscript(payload) {
  return request('/events/voice/parse', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function updateEvent(eventId, payload) {
  return request(`/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function deleteEvent(eventId) {
  return request(`/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
}



export async function updateUserStatus(userId, payload) {
  return request(`/auth/users/${encodeURIComponent(userId)}/status`, {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getAdminAudit() {
  return request('/auth/admin-audit', {
    headers: authHeaders(),
  });
}

export async function getMyHistory() {
  return request('/auth/my-history', {
    headers: authHeaders(),
  });
}


export async function analyzeCropImage(payload) {
  return request('/crop-diagnosis/analyze', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
}

export async function getSatelliteAnalytics() {
  return request('/satellite/analytics', {
    headers: authHeaders(),
  });
}
