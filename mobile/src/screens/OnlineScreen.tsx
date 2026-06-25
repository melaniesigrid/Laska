/**
 * Online ranked play — a full playable vertical against the live server.
 *
 * Phases (driven by useOnline): sign in (guest, or email/password) → find a
 * ranked match → play it out on the real board (optimistic moves, server-
 * authoritative) with both clocks, draw offers and resignation → end screen with
 * the rating delta.
 *
 * The board orients to the local player (flipped for Black). When several capture
 * chains share a landing square, a route chooser asks which path you intend and
 * the chosen full `captures` path is sent to the server (no silent first-pick).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Board } from '../components/Board.tsx';
import { Button } from '../components/Button.tsx';
import { CaptureChooser } from '../components/CaptureChooser.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { inset } from '../theme/neumorphic.ts';
import { spacing, radius, type, type Palette } from '../theme/tokens.ts';
import { useOnlineSession, type OnlineSession } from '../online/OnlineProvider.tsx';
import { type Move, type PlayerColor } from '../engine/index.ts';

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

export function OnlineScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const online = useOnlineSession();

  const [selected, setSelected] = useState<number | null>(null);
  const [moveChoices, setMoveChoices] = useState<Move[]>([]);

  // Destination square -> the move(s) that land there (>1 = a route choice).
  const destinations = useMemo(() => {
    const map = new Map<number, Move[]>();
    if (selected == null) return map;
    for (const m of online.legalMoves) {
      if (m.from !== selected) continue;
      const opts = map.get(m.to) ?? [];
      opts.push(m);
      map.set(m.to, opts);
    }
    return map;
  }, [selected, online.legalMoves]);

  const targets = useMemo(() => [...destinations.keys()], [destinations]);

  // A server update (new authoritative board) or a turn flip invalidates any
  // in-progress local selection or route choice.
  useEffect(() => {
    setSelected(null);
    setMoveChoices([]);
  }, [online.myTurn, online.gameState]);

  const onTapSquare = useCallback(
    (square: number) => {
      // Pause all move input while the socket is down — the board will resync
      // from the server on reconnect, so a local move now would be a lie.
      if (!online.myTurn || online.status !== 'connected') return;
      const options = destinations.get(square);
      if (selected != null && options?.length) {
        if (options.length === 1) {
          online.submitMove(options[0]!);
          setSelected(null);
        } else {
          setMoveChoices(options);
        }
        return;
      }
      const movable = online.legalMoves.some((m) => m.from === square);
      setSelected(movable ? (cur) => (cur === square ? null : square) : null);
      setMoveChoices([]);
    },
    [online, selected, destinations],
  );

  const chooseMove = useCallback(
    (move: Move) => {
      online.submitMove(move);
      setSelected(null);
      setMoveChoices([]);
    },
    [online],
  );

  const boardSize = Math.min(width - spacing.lg * 2, 460);
  const myColor = online.match?.myColor ?? 'W';
  const flip = myColor === 'B';

  // ----- match view -----
  if ((online.phase === 'matched' || online.phase === 'ended') && online.gameState && online.match) {
    const { match, clock, end } = online;
    const oppColor: PlayerColor = myColor === 'W' ? 'B' : 'W';
    const myMs = myColor === 'W' ? clock?.whiteMs : clock?.blackMs;
    const oppMs = myColor === 'W' ? clock?.blackMs : clock?.whiteMs;
    const drawFromOpp = online.drawOfferBy != null && online.drawOfferBy === oppColor;
    const connected = online.status === 'connected';

    const statusLine =
      online.phase === 'ended'
        ? endText(end, myColor)
        : !connected
          ? 'Reconnecting…'
          : online.myTurn
            ? 'Your move'
            : `${COLOR_NAME[oppColor]} to move`;

    return (
      <View
        style={[
          styles.matchContainer,
          { backgroundColor: palette.backdrop, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        {!connected && online.phase !== 'ended' && (
          <View style={[styles.banner, inset(palette, 4)]} accessibilityRole="alert">
            <Text style={[styles.bannerTitle, { color: palette.text }]}>
              {online.status === 'connecting' ? 'Connecting…' : 'Connection interrupted'}
            </Text>
            <Text style={[styles.bannerBody, { color: palette.textMuted }]}>
              Moves are paused. The board will resync from the server automatically.
            </Text>
          </View>
        )}

        <ClockRow
          name={match.opponent.username}
          rating={match.opponent.rating}
          ms={oppMs}
          running={clock?.running === oppColor}
          palette={palette}
        />

        <View style={styles.boardWrap}>
          <View style={[styles.statusPill, inset(palette, 4)]}>
            <Text style={[styles.statusText, { color: palette.btnInk }]}>{statusLine}</Text>
          </View>
          <Board
            board={online.gameState.board}
            selected={selected}
            targets={targets}
            palette={palette}
            size={boardSize}
            onTapSquare={onTapSquare}
            flip={flip}
            lastMove={online.lastMove}
          />
          {drawFromOpp && online.phase === 'matched' && (
            <Text style={[styles.note, { color: palette.text }]}>Opponent offers a draw</Text>
          )}
          {online.drawOfferBy === myColor && online.phase === 'matched' && (
            <Text style={[styles.note, { color: palette.textMuted }]}>Draw offered…</Text>
          )}
          {online.error && <Text style={[styles.note, { color: palette.danger }]}>{online.error}</Text>}
        </View>

        <ClockRow
          name={online.user?.username ?? 'You'}
          rating={online.user?.rating ?? 0}
          ms={myMs}
          running={clock?.running === myColor}
          palette={palette}
          me
        />

        <View style={styles.controls}>
          {online.phase === 'ended' ? (
            <Button label="New game" onPress={online.newOnlineGame} style={styles.ctrl} />
          ) : (
            <>
              {drawFromOpp ? (
                <Button label="Accept draw" onPress={online.acceptDraw} disabled={!connected} style={styles.ctrl} />
              ) : (
                <Button
                  label="Offer draw"
                  variant="ghost"
                  onPress={online.offerDraw}
                  disabled={!connected || online.drawOfferBy === myColor}
                  style={styles.ctrl}
                />
              )}
              <Button label="Resign" variant="ghost" onPress={online.resign} disabled={!connected} style={styles.ctrl} />
            </>
          )}
        </View>

        <CaptureChooser choices={moveChoices} palette={palette} onChoose={chooseMove} onCancel={() => setMoveChoices([])} />
      </View>
    );
  }

  // ----- lobby / auth view -----
  return (
    <ScrollView
      style={{ backgroundColor: palette.backdrop }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: palette.text }]}>Online</Text>
      <Text style={[styles.status, { color: palette.textMuted }]}>
        {online.status}
        {online.user ? ` · ${online.user.username} (${online.user.rating})` : ''}
      </Text>

      {online.error && <Text style={[styles.note, { color: palette.danger }]}>{online.error}</Text>}

      {!online.user ? (
        <AuthPanel online={online} palette={palette} />
      ) : online.phase === 'queued' ? (
        <>
          <Text style={[styles.status, { color: palette.text }]}>Searching for an opponent…</Text>
          <Button label="Cancel" variant="ghost" onPress={online.leaveQueue} />
        </>
      ) : (
        <Button
          label="Find ranked match"
          onPress={online.joinQueue}
          disabled={online.status !== 'connected'}
        />
      )}

      {online.user && (
        <Button label="Sign out" variant="ghost" onPress={online.logout} style={styles.signout} />
      )}

      <Leaderboard
        rows={online.leaderboard}
        meId={online.user?.id ?? null}
        palette={palette}
        onRefresh={online.refreshLeaderboard}
      />
    </ScrollView>
  );
}

function Leaderboard({
  rows,
  meId,
  palette,
  onRefresh,
}: {
  rows: { userId: string; username: string; rating: number; ratedGames: number }[];
  meId: string | null;
  palette: Palette;
  onRefresh: () => void;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={styles.board}>
      <Pressable onPress={onRefresh} accessibilityRole="button" style={styles.boardHead}>
        <Text style={[styles.section, { color: palette.textMuted }]}>Top players</Text>
        <Text style={[styles.refresh, { color: palette.accent }]}>Refresh</Text>
      </Pressable>
      {rows.map((r, i) => {
        const me = meId != null && r.userId === meId;
        return (
          <View
            key={r.userId}
            style={[styles.leaderRow, me && { backgroundColor: palette.highlight }]}
          >
            <Text style={[styles.rank, { color: palette.textMuted }]}>{i + 1}</Text>
            <Text style={[styles.leaderName, { color: palette.text }]} numberOfLines={1}>
              {r.username}
              {me ? ' (you)' : ''}
            </Text>
            <Text style={[styles.leaderRating, { color: palette.text }]}>{r.rating}</Text>
          </View>
        );
      })}
    </View>
  );
}

function AuthPanel({ online, palette }: { online: OnlineSession; palette: Palette }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const field = (
    label: string,
    value: string,
    setValue: (v: string) => void,
    props: React.ComponentProps<typeof TextInput> = {},
  ) => (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={setValue}
        placeholderTextColor={palette.textMuted}
        style={[styles.input, inset(palette, 3), { color: palette.text }]}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
    </View>
  );

  return (
    <View style={styles.authPanel}>
      <Button label="Play as guest" onPress={online.guest} />

      <Text style={[styles.section, { color: palette.textMuted }]}>
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Text>
      {mode === 'register' &&
        field('Username', username, setUsername, { autoComplete: 'username', textContentType: 'username' })}
      {field('Email', email, setEmail, { autoComplete: 'email', keyboardType: 'email-address', textContentType: 'emailAddress' })}
      {field('Password', password, setPassword, { secureTextEntry: true, autoComplete: 'password', textContentType: 'password' })}

      {mode === 'login' ? (
        <Button label="Sign in" onPress={() => online.login(email, password)} />
      ) : (
        <Button label="Create account" onPress={() => online.register(email, password, username)} />
      )}
      <Button
        label={mode === 'login' ? 'Need an account? Register' : 'Have an account? Sign in'}
        variant="ghost"
        onPress={() => {
          online.clearError();
          setMode(mode === 'login' ? 'register' : 'login');
        }}
      />
    </View>
  );
}

function endText(
  end: { winner: PlayerColor | null; reason: string } | null,
  myColor: PlayerColor,
): string {
  if (!end) return 'Game over';
  const reason = end.reason.replace(/-/g, ' ');
  if (end.winner == null) return `Draw — ${reason}`;
  return end.winner === myColor ? `You win — ${reason}` : `You lose — ${reason}`;
}

function ClockRow({
  name,
  rating,
  ms,
  running,
  palette,
  me,
}: {
  name: string;
  rating: number;
  ms: number | undefined;
  running: boolean;
  palette: Palette;
  me?: boolean;
}) {
  return (
    <View style={styles.clockRow}>
      <Text style={[styles.player, { color: palette.text }]} numberOfLines={1}>
        {me ? 'You' : name} <Text style={{ color: palette.textMuted }}>{rating}</Text>
      </Text>
      <View style={[styles.clock, { backgroundColor: running ? palette.accent : palette.shade }]}>
        <Text style={[styles.clockText, { color: running ? palette.highlight : palette.text }]}>
          {ms != null ? formatClock(ms) : '—:—'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // lobby / auth
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...type.title },
  status: { ...type.body },
  signout: { marginTop: spacing.lg },
  authPanel: { gap: spacing.md },
  section: { ...type.label },
  // leaderboard
  board: { marginTop: spacing.xl, gap: spacing.xs },
  boardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
  refresh: { ...type.label },
  leaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
  },
  rank: { ...type.body, width: 28, textAlign: 'right' },
  leaderName: { ...type.body, flex: 1 },
  leaderRating: { ...type.body, fontVariant: ['tabular-nums'] },
  // reconnect banner
  banner: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
  bannerTitle: { ...type.body, fontWeight: '600' },
  bannerBody: { ...type.body, fontSize: 13 },
  field: { gap: spacing.xs },
  fieldLabel: { ...type.label },
  input: {
    ...type.body,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  // match
  matchContainer: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.sm },
  boardWrap: { alignItems: 'center', justifyContent: 'center', flex: 1, gap: spacing.sm },
  statusPill: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignSelf: 'center',
  },
  statusText: { ...type.status },
  note: { ...type.body, textAlign: 'center' },
  controls: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  ctrl: { flex: 1, maxWidth: 220 },
  clockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  player: { ...type.body, flexShrink: 1 },
  clock: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, minWidth: 72, alignItems: 'center' },
  clockText: { ...type.status, fontVariant: ['tabular-nums'] },
});
