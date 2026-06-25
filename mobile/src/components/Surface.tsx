/**
 * Surface — a neumorphic card/panel. The reusable building block for cards in
 * Profile/Online/CaptureChooser, replacing the old flat `backgroundColor` views.
 *
 *   <Surface>            raised card (lifted from the page)
 *   <Surface variant="inset">   recessed tray (sunk into the page)
 *
 * Depth is the shadow offset in px; rounded by default to radius.lg.
 */
import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { raised, inset } from '../theme/neumorphic.ts';
import { radius, spacing } from '../theme/tokens.ts';

interface SurfaceProps {
  children: React.ReactNode;
  variant?: 'raised' | 'inset';
  depth?: number;
  style?: StyleProp<ViewStyle>;
}

export function Surface({ children, variant = 'raised', depth, style }: SurfaceProps) {
  const { palette } = useTheme();
  const shadow = variant === 'inset' ? inset(palette, depth ?? 5) : raised(palette, depth ?? 7);
  return <View style={[styles.base, shadow, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
