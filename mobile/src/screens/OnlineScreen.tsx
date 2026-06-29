/**
 * Online ranked play — a full playable vertical against the live server.
 *
 * Phases (driven by useOnline): sign in (guest, or email/password) → find a
 * ranked match → play it out on the real board (optimistic moves, server-
 * authoritative) with both clocks, draw offers and resignation → end screen with
 * the rating delta.
 *
 * The board orients to the local player (flipped for Black). A multi-jump is
 * played out one leap at a time — the player jumps each enemy themselves (tap
 * each landing in sequence), which makes the route unambiguous, so there is no
 * capture route-picker. The full Move (with its ordered captures) is submitted to
 * the server on the final leap; the server stays authoritative.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Board } from '../components/Board.tsx';
import { Button } from '../components/Button.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { inset } from '../theme/neumorphic.ts';
import { spacing, radius, type, type Palette } from '../theme/tokens.ts';
import { useOnlineSession, type OnlineSession } from '../online/OnlineProvider.tsx';
import {
  beginCaptureChain,
  nextHopTargets,
  advanceCaptureChain,
  moveStepBoards,
  VARIANTS,
  LASKA,
  type CaptureChain,
  type PlayerColor,
} from '../engine/index.ts';

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
  // A HUMAN multi-jump in flight: the origin, the leaps already taken, and the
  // candidate Moves still consistent with them. The next tap need only pick a leap.
  const [capture, setCapture] = useState<CaptureChain | null>(null);

  // The capture chain in play: the one mid-flight, or — for a freshly selected
  // capturing column — a fresh chain so the FIRST leap is offered. Null when the
  // selection has only quiet moves (then the quiet landings light up instead).
  const activeChain = useMemo<CaptureChain | null>(() => {
    if (capture) return capture;
    if (selected != null) return beginCaptureChain(online.legalMoves, selected);
    return null;
  }, [capture, selected, online.legalMoves]);

  // The squares tappable next: the NEXT leap's landings mid-chain, otherwise the
  // quiet landings of the selected column.
  const targets = useMemo(() => {
    if (activeChain) return [...nextHopTargets(activeChain).keys()];
    if (selected == null) return [];
    const set = new Set<number>();
    for (const m of online.legalMoves) if (m.from === selected) set.add(m.to);
    return [...set];
  }, [activeChain, selected, online.legalMoves]);

  // The square the moving column currently sits on (last leap, or the selection).
  const movingSquare = capture ? capture.steps[capture.steps.length - 1]! : selected;

  // A server update (new authoritative board) or a turn flip invalidates any
  // in-progress local selection or half-played chain.
  useEffect(() => {
    setSelected(null);
    setCapture(null);
    online.setPreview(null, null);
    // online identity is stable per render but setPreview is a stable callback;
    // depend only on the authoritative signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online.myTurn, online.gameState]);

  /** Advance a human-played capture by one leap to `sq`. Glides the column one
   *  step via a preview board; submits the full Move once the chain finishes. */
  const advanceCapture = useCallback(
    (sq: number) => {
      const chain = activeChain;
      const gs = online.gameState;
      if (!chain || !gs) return;
      const res = advanceCaptureChain(chain, sq);
      if (!res) return; // not a legal next leap
      const depth = chain.steps.length;
      const from = depth === 0 ? chain.origin : chain.steps[depth - 1]!;
      if (res.kind === 'commit') {
        // Final leap: submit the full Move (server-authoritative); the optimistic
        // board supersedes the preview.
        setSelected(null);
        setCapture(null);
        online.submitMove(res.move);
      } else {
        // More jumps forced — show this leap's board and await the next tap.
        const rep = res.chain.candidates[0]!;
        const board = moveStepBoards(gs, rep)[depth]!;
        online.setPreview(board, { from, to: sq });
        setSelected(sq);
        setCapture(res.chain);
      }
    },
    [activeChain, online],
  );

  const onTapSquare = useCallback(
    (square: number) => {
      // Pause all move input while the socket is down — the board will resync
      // from the server on reconnect, so a local move now would be a lie.
      if (!online.myTurn || online.status !== 'connected') return;

      // Mid-capture: the only meaningful taps are the next legal leap.
      if (capture) {
        if (targets.includes(square)) advanceCapture(square);
        return;
      }

      // Tapping a highlighted target: captures play one leap at a time, quiet
      // moves submit straight away.
      if (selected != null && targets.includes(square)) {
        if (activeChain) {
          advanceCapture(square);
        } else {
          const m = online.legalMoves.find((mv) => mv.from === selected && mv.to === square);
          if (m) {
            setSelected(null);
            online.submitMove(m);
          }
        }
        return;
      }

      const movable = online.legalMoves.some((m) => m.from === square);
      setSelected(movable ? (cur) => (cur === square ? null : square) : null);
    },
    [online, selected, capture, targets, activeChain, advanceCapture],
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
            board={online.board ?? online.gameState.board}
            selected={movingSquare}
            targets={targets}
            palette={palette}
            size={boardSize}
            onTapSquare={onTapSquare}
            flip={flip}
            lastMove={online.lastMove}
            variant={(online.match && VARIANTS[online.match.variant]) || LASKA}
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
        <>
          <Button
            label="Find Laska match"
            onPress={() => online.joinQueue('laska')}
            disabled={online.status !== 'connected'}
          />
          <Button
            label="Find Bashni match"
            variant="ghost"
            onPress={() => online.joinQueue('bashni')}
            disabled={online.status !== 'connected'}
          />
        </>
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
