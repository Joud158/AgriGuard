import Pusher from 'pusher-js';

const PUSHER_KEY = import.meta.env.VITE_PUSHER_KEY || '';
const PUSHER_CLUSTER = import.meta.env.VITE_PUSHER_CLUSTER || 'eu';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:4000/api';

let pusherClient = null;
let currentSocketId = '';

function getStoredToken() {
  const possibleKeys = [
    'token',
    'accessToken',
    'agriguard-token',
    'agriguardToken',
    'agriguard-session',
    'auth',
    'session',
    'user',
    'volleyserve-session',
  ];

  for (const storage of [localStorage, sessionStorage]) {
    for (const key of possibleKeys) {
      const rawValue = storage.getItem(key);

      if (!rawValue) continue;

      if (rawValue.startsWith('eyJ')) {
        return rawValue;
      }

      try {
        const parsed = JSON.parse(rawValue);

        if (parsed?.token) return parsed.token;
        if (parsed?.accessToken) return parsed.accessToken;
        if (parsed?.data?.token) return parsed.data.token;
        if (parsed?.session?.token) return parsed.session.token;
        if (parsed?.user?.token) return parsed.user.token;
        if (parsed?.auth?.token) return parsed.auth.token;
      } catch {
        // Ignore non-JSON values.
      }
    }
  }

  for (const storage of [localStorage, sessionStorage]) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      const rawValue = storage.getItem(key);

      if (!rawValue) continue;

      if (rawValue.startsWith('eyJ')) {
        return rawValue;
      }

      try {
        const parsed = JSON.parse(rawValue);

        if (parsed?.token) return parsed.token;
        if (parsed?.accessToken) return parsed.accessToken;
        if (parsed?.data?.token) return parsed.data.token;
        if (parsed?.session?.token) return parsed.session.token;
        if (parsed?.user?.token) return parsed.user.token;
        if (parsed?.auth?.token) return parsed.auth.token;
      } catch {
        // Ignore unrelated values.
      }
    }
  }

  return '';
}

function buildAuthHeaders() {
  const token = getStoredToken();

  if (!token) {
    return {};
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export function isPusherConfigured() {
  return Boolean(PUSHER_KEY && PUSHER_CLUSTER);
}

export function getCurrentSocketId() {
  return currentSocketId;
}

export function disconnectPusherClient() {
  if (pusherClient) {
    pusherClient.disconnect();
  }

  pusherClient = null;
  currentSocketId = '';
}

export function getPusherClient() {
  if (!isPusherConfigured()) {
    return null;
  }

  const token = getStoredToken();

  // Important: if we cannot find the token, do not attempt private-channel auth.
  // This prevents Pusher auth 401 from behaving like a user logout.
  if (!token) {
    console.warn('Pusher skipped: no auth token found in browser storage.');
    return null;
  }

  if (pusherClient) {
    return pusherClient;
  }

  const authEndpoint = `${API_BASE_URL.replace(/\/$/, '')}/pusher/auth`;

  pusherClient = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    forceTLS: true,

    // Newer pusher-js versions
    channelAuthorization: {
      transport: 'ajax',
      endpoint: authEndpoint,
      headersProvider: buildAuthHeaders,
    },

    // Older pusher-js versions
    authEndpoint,
    auth: {
      headers: buildAuthHeaders(),
    },
  });

  pusherClient.connection.bind('connected', () => {
    currentSocketId = pusherClient.connection.socket_id || '';
  });

  pusherClient.connection.bind('disconnected', () => {
    currentSocketId = '';
  });

  pusherClient.connection.bind('error', (error) => {
    console.warn('Pusher connection error:', error);
  });

  return pusherClient;
}