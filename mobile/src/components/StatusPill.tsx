import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { inset } from '../theme/neumorphic.ts';
import { radius, spacing, type } from '../theme/tokens.ts';
import type { GameOutcome, PlayerColor } from '../engine/index.ts';

const COLOR_NAME: Record<PlayerColor, string> = { W: 'White', B: 'Black' };

function statusText(outcome: GameOutcome, toMove: PlayerColor, thinking: boolean): string {
  if (outcome.state === 'win') {
    const reason = outcome.reason === 'resignation' ? ' by resignation' : '';
    return `${COLOR_NAME[outcome.winner]} wins${reason}`;
  }
  if (outcome.state === 'draw') return `Draw — ${outcome.reason.replace(/-/g, ' ')}`;
  if (thinking) return 'Thinking…';
  return `${COLOR_NAME[toMove]} to move`;
}

export function StatusPill({
  outcome,
  toMove,
  thinking,
}: {
  outcome: GameOutcome;
  toMove: PlayerColor;
  thinking: boolean;
}) {
  const { palette } = useTheme();
  // Win is the only celebratory state; everything else reads in the button ink.
  const ink = outcome.state === 'win' ? palette.win : palette.btnInk;
  return (
    <View style={[styles.pill, inset(palette, 4)]}>
      <Text style={[styles.text, { color: ink }]}>
        {statusText(outcome, toMove, thinking)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignSelf: 'center',
  },
  text: { ...type.status },
});
