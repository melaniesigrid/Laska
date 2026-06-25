/**
 * App-wide online session. Previously every screen called useOnline() and got
 * its OWN LaskaClient — so the Online tab and the Profile tab held separate,
 * desynced sessions. This provider owns a SINGLE useOnline instance at the
 * navigation root and shares it, so account state (user, rating, connection) is
 * consistent everywhere and there is one socket for the whole app.
 *
 * Endpoints come from Expo `Constants.extra` (set per build profile in
 * app.config.ts), falling back to localhost for `expo start` against a local
 * server.
 */
import React, { createContext, useContext, useMemo } from 'react';
import Constants from 'expo-constants';
import { useOnline } from '../hooks/useOnline.ts';

export type OnlineSession = ReturnType<typeof useOnline>;

function endpoints() {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBase?: string; wsUrl?: string };
  return {
    apiBase: extra.apiBase ?? 'http://localhost:8080',
    wsUrl: (extra.wsUrl ?? 'ws://localhost:8080') + '/ws',
  };
}

const OnlineContext = createContext<OnlineSession | null>(null);

export function OnlineProvider({ children }: { children: React.ReactNode }) {
  const { apiBase, wsUrl } = useMemo(endpoints, []);
  const session = useOnline(apiBase, wsUrl);
  return <OnlineContext.Provider value={session}>{children}</OnlineContext.Provider>;
}

export function useOnlineSession(): OnlineSession {
  const ctx = useContext(OnlineContext);
  if (!ctx) throw new Error('useOnlineSession must be used within <OnlineProvider>');
  return ctx;
}
