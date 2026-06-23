/**
 * Online ranked play — minimal but REAL wiring of the ported LaskaClient:
 * guest auth → connect → join queue → render match updates. This proves the net
 * vertical end-to-end against the existing server protocol. The full online UX
 * (board-flip for Black, reconnect banner, draw offers, clocks, capture
 * disambiguation) is the next vertical to port from web/src/Online.tsx +
 * useOnline.ts — tracked in ../../MOBILE.md.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Button } from '../components/Button.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { spacing, type } from '../theme/tokens.ts';
import { LaskaClient, type ConnStatus, type PublicUser } from '../net/client.ts';
import type { ServerMessage } from '../net/protocol.ts';

function endpoints() {
  const extra = (Constants.expoConfig?.extra ?? {}) as { apiBase?: string; wsUrl?: string };
  return {
    apiBase: extra.apiBase ?? 'http://localhost:8080',
    wsUrl: extra.wsUrl ?? 'ws://localhost:8080',
  };
}

export function OnlineScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const clientRef = useRef<LaskaClient | null>(null);
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [user, setUser] = useState<PublicUser | null>(null);
  const [queued, setQueued] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const append = useCallback((line: string) => setLog((l) => [line, ...l].slice(0, 20)), []);

  useEffect(() => {
    const { apiBase, wsUrl } = endpoints();
    const client = new LaskaClient(apiBase, wsUrl, {
      onStatus: setStatus,
      onMessage: (msg: ServerMessage) => {
        if (msg.type === 'queue.joined') setQueued(true);
        if (msg.type === 'queue.left') setQueued(false);
        if (msg.type === 'match.start') {
          setQueued(false);
          client.setCurrentMatch(msg.matchId);
          append(`Match started (${msg.matchId.slice(0, 8)}…)`);
        } else {
          append(msg.type);
        }
      },
    });
    clientRef.current = client;
    void client.init();
    return () => client.disconnect();
  }, [append]);

  const playGuest = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    setBusy(true);
    try {
      const u = await client.guest();
      setUser(u);
      client.connect();
      append(`Signed in as guest "${u.username}" (rating ${u.rating})`);
    } catch (e) {
      append(`Auth failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }, [append]);

  const toggleQueue = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    client.send(queued ? { type: 'queue.leave' } : { type: 'queue.join' });
  }, [queued]);

  return (
    <ScrollView
      style={{ backgroundColor: palette.ground }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
    >
      <Text style={[styles.title, { color: palette.text }]}>Online</Text>
      <Text style={[styles.status, { color: palette.textMuted }]}>
        {status}
        {user ? ` · ${user.username}` : ''}
      </Text>

      {!user ? (
        <Button label="Play as guest" onPress={playGuest} disabled={busy} />
      ) : (
        <Button
          label={queued ? 'Leave queue' : 'Find ranked match'}
          onPress={toggleQueue}
          disabled={status !== 'connected'}
        />
      )}

      <Text style={[styles.section, { color: palette.textMuted }]}>Server events</Text>
      <View style={styles.log}>
        {log.map((line, i) => (
          <Text key={i} style={[styles.logLine, { color: palette.textMuted }]}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...type.title },
  status: { ...type.body },
  section: { ...type.label, marginTop: spacing.lg },
  log: { gap: spacing.xs },
  logLine: { ...type.body, fontSize: 13 },
});
