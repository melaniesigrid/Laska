/**
 * Play menu: pick hot-seat or vs-AI (and difficulty), then open the board.
 * Difficulty tiers come from the SHARED engine (DIFFICULTY_ORDER).
 */
import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { spacing, type } from '../theme/tokens.ts';
import { DIFFICULTY_ORDER, type Difficulty } from '../engine/index.ts';
import type { PlayStackScreenProps } from '../navigation/types.ts';

export function PlayMenuScreen({ navigation }: PlayStackScreenProps<'PlayMenu'>) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [difficulty, setDifficulty] = useState<Difficulty>(
    DIFFICULTY_ORDER[Math.min(2, DIFFICULTY_ORDER.length - 1)]!,
  );

  return (
    <ScrollView
      style={{ backgroundColor: palette.backdrop }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
    >
      <Text style={[styles.title, { color: palette.text }]}>Laska</Text>
      <Text style={[styles.sub, { color: palette.textMuted }]}>
        Lasker's column-capturing draughts
      </Text>

      <Text style={[styles.section, { color: palette.textMuted }]}>Local</Text>
      <Button
        label="Two players (hot-seat)"
        onPress={() => navigation.navigate('Game', { mode: { kind: 'hotseat' } })}
      />

      <Text style={[styles.section, { color: palette.textMuted }]}>Vs computer · {difficulty}</Text>
      <View style={styles.tiers}>
        {DIFFICULTY_ORDER.map((d) => (
          <Button
            key={d}
            label={d}
            variant={d === difficulty ? 'solid' : 'ghost'}
            onPress={() => setDifficulty(d)}
            style={styles.tier}
          />
        ))}
      </View>
      <Button
        label={`Play ${difficulty} AI`}
        onPress={() =>
          navigation.navigate('Game', { mode: { kind: 'ai', aiColor: 'B', difficulty } })
        }
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...type.title, textAlign: 'center' },
  sub: { ...type.body, textAlign: 'center', marginBottom: spacing.lg },
  section: { ...type.label, marginTop: spacing.lg },
  tiers: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tier: { flexGrow: 1, minWidth: 90 },
});
