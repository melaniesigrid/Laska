/**
 * Capture-route chooser. When several legal capture chains depart the same
 * column and land on the SAME square, the engine returns them as distinct Moves
 * with different `captures`/`path`. Tapping the destination is ambiguous, so we
 * ask the player which path they intend and submit that exact full chain — never
 * a silent first-pick. Shared by local and online play.
 */
import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Button } from './Button.tsx';
import { raised, inset } from '../theme/neumorphic.ts';
import { spacing, radius, type } from '../theme/tokens.ts';
import type { Palette } from '../theme/tokens.ts';
import { SQUARE_TO_RC, type Move } from '../engine/index.ts';

function squareName(square: number): string {
  const rc = SQUARE_TO_RC[square];
  if (!rc) return String(square);
  return `${String.fromCharCode(97 + rc.col)}${rc.row + 1}`;
}

/** Human-readable full route for capture chains that end on the same square. */
function moveRoute(move: Move): string {
  const landings = move.path.map(squareName).join(' → ');
  const captured = move.captures.map(squareName).join(', ');
  return `${squareName(move.from)} → ${landings} · takes ${captured}`;
}

export function CaptureChooser({
  choices,
  palette,
  onChoose,
  onCancel,
}: {
  choices: Move[];
  palette: Palette;
  onChoose: (move: Move) => void;
  onCancel: () => void;
}) {
  const visible = choices.length > 1;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Inner press swallows taps so the backdrop only dismisses on the edges. */}
        <Pressable style={[styles.card, raised(palette, 8)]} onPress={() => {}}>
          <Text style={[styles.title, { color: palette.text }]}>Choose the capture route</Text>
          {visible && (
            <Text style={[styles.note, { color: palette.textMuted }]}>
              Both chains land on {squareName(choices[0]!.to)}. Choose the path you intend.
            </Text>
          )}
          {choices.map((move, i) => (
            <Pressable
              key={`${move.path.join('-')}:${move.captures.join('-')}`}
              onPress={() => onChoose(move)}
              accessibilityRole="button"
              style={[styles.routeBtn, inset(palette, 3)]}
            >
              <Text style={[styles.routeName, { color: palette.accent }]}>Route {i + 1}</Text>
              <Text style={[styles.routeText, { color: palette.text }]}>{moveRoute(move)}</Text>
            </Pressable>
          ))}
          <Button label="Cancel" variant="ghost" onPress={onCancel} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: spacing.lg },
  card: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...type.status, textAlign: 'center' },
  note: { ...type.body, textAlign: 'center' },
  routeBtn: { padding: spacing.md, borderRadius: radius.md, gap: spacing.xs },
  routeName: { ...type.label },
  routeText: { ...type.body, fontSize: 14 },
});
