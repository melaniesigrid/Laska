/**
 * The working vertical slice: a full local game (hot-seat or vs-AI) on the real
 * engine. Auth → primary screen → core action is satisfied here as
 * menu → board → make a legal move that the engine validates.
 */
import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Board } from '../components/Board.tsx';
import { Button } from '../components/Button.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { useGame, type GameMode } from '../hooks/useGame.ts';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { spacing } from '../theme/tokens.ts';
import type { PlayStackScreenProps } from '../navigation/types.ts';

export function GameScreen({ route }: PlayStackScreenProps<'Game'>) {
  const mode: GameMode = route.params.mode;
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const game = useGame(mode);

  // Board sizes to width with breathing room; safe-area aware.
  const boardSize = Math.min(width - spacing.lg * 2, 460);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.backdrop, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md },
      ]}
    >
      <StatusPill outcome={game.outcome} toMove={game.state.toMove} thinking={game.thinking} />

      <View style={styles.boardWrap}>
        <Board
          board={game.board}
          selected={game.selected}
          targets={game.targets}
          palette={palette}
          size={boardSize}
          onTapSquare={game.tap}
          lastMove={game.lastMove}
        />
      </View>

      <View style={styles.controls}>
        <Button label="New game" onPress={game.reset} style={styles.ctrl} />
        <Button
          label="Resign"
          variant="ghost"
          onPress={game.resign}
          disabled={game.outcome.state !== 'ongoing'}
          style={styles.ctrl}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing.lg, gap: spacing.lg },
  boardWrap: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  controls: { flexDirection: 'row', gap: spacing.md, justifyContent: 'center' },
  ctrl: { flex: 1, maxWidth: 220 },
});
