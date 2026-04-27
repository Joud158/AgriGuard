import React from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../services/authApi';
import { disconnectPusherClient } from '../services/pusherClient';

const AuthContext = createContext(null);
const AUTH_STORAGE_KEY = 'agriguard-session';

function readStoredSession() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readStoredSession);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    let active = true;

    async function hydrateSession() {
      const storedSession = readStoredSession();

      if (!storedSession?.token) {
        if (active) setInitializing(false);
        return;
      }

      const response = await authApi.getMe();

      if (!active) return;

      if (response.success) {
        setSession({
          token: storedSession.token,
          user: response.data,
        });
      } else {
        setSession(null);
      }

      setInitializing(false);
    }

    hydrateSession().catch(() => {
      if (!active) return;
      setSession(null);
      setInitializing(false);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (session) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [session]);

  async function login(values) {
    setLoading(true);
    try {
      const response = await authApi.login(values);
      if (response.success && response.data?.token) {
        setSession(response.data);
      }
      return response;
    } finally {
      setLoading(false);
    }
  }

  async function completeMfaLogin(challengeToken, code) {
    setLoading(true);
    try {
      const response = await authApi.verifyLoginMfa({ challengeToken, code });
      if (response.success && response.data?.token) {
        setSession(response.data);
      }
      return response;
    } finally {
      setLoading(false);
    }
  }

  async function registerAdmin(values) {
    setLoading(true);
    try {
      const response = await authApi.registerAdmin(values);
      if (response.success && response.data?.token) {
        setSession(response.data);
      }
      return response;
    } finally {
      setLoading(false);
    }
  }

  async function acceptInvitation(token, values) {
    setLoading(true);
    try {
      const response = await authApi.acceptInvitation(token, values);
      if (response.success) {
        setSession(response.data);
      }
      return response;
    } finally {
      setLoading(false);
    }
  }

  async function refreshSession() {
    if (!session?.token) return null;

    const response = await authApi.getMe();
    if (response.success) {
      setSession((current) => (current ? { ...current, user: response.data } : current));
    }
    return response;
  }

  function logout() {
    disconnectPusherClient();
    setSession(null);
  }

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      token: session?.token ?? null,
      loading,
      initializing,
      isAuthenticated: Boolean(session?.token),
      login,
      completeMfaLogin,
      registerAdmin,
      acceptInvitation,
      refreshSession,
      logout,
    }),
    [initializing, loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return context;
}

