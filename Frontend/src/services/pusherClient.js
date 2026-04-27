import Pusher from 'pusher-js';
import { API_BASE_URL, getSessionToken } from './authApi';

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || '';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || 'eu';

let client = null;
let currentSocketId = '';
let authFailed = false;

export function isPusherConfigured() {
  return Boolean(PUSHER_KEY && PUSHER_CLUSTER && !authFailed);
}

export function getCurrentSocketId() {
  return currentSocketId;
}

export function disconnectPusherClient() {
  if (client) {
    client.disconnect();
  }

  client = null;
  currentSocketId = '';
  authFailed = false;
}

function buildAuthEndpoint() {
  return `${API_BASE_URL.replace(/\/$/, '')}/conversations/pusher/auth`;
}

function authorizeChannel(channel, socketId, callback) {
  const token = getSessionToken();

  if (!token) {
    authFailed = true;
    callback(true, { error: 'No active AgriGuard session token for realtime chat.' });
    return;
  }

  fetch(buildAuthEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      socket_id: socketId,
      channel_name: channel.name,
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        authFailed = true;
        console.warn('Pusher channel authorization failed:', {
          status: response.status,
          channel: channel.name,
          data,
        });
        callback(true, data);
        return;
      }

      callback(false, data);
    })
    .catch((error) => {
      authFailed = true;
      console.warn('Pusher channel authorization request failed:', error);
      callback(true, { error: error.message });
    });
}

export function getPusherClient() {
  if (!PUSHER_KEY || !PUSHER_CLUSTER || authFailed) {
    return null;
  }

  if (!getSessionToken()) {
    authFailed = true;
    return null;
  }

  if (client) {
    return client;
  }

  client = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,
    enabledTransports: ['ws', 'wss'],
    disabledTransports: ['sockjs'],

    // Older pusher-js API.
    authorizer: (channel) => ({
      authorize: (socketId, callback) => authorizeChannel(channel, socketId, callback),
    }),

    // Newer pusher-js API.
    channelAuthorization: {
      transport: 'ajax',
      endpoint: buildAuthEndpoint(),
      headersProvider: () => {
        const token = getSessionToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    },
  });

  client.connection.bind('connected', () => {
    currentSocketId = client?.connection?.socket_id || '';
    authFailed = false;
  });

  client.connection.bind('disconnected', () => {
    currentSocketId = '';
  });

  client.connection.bind('error', (error) => {
    console.warn('Pusher connection error:', error);
  });

  return client;
}
