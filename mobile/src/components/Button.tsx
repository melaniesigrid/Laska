import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { raised, pressed } from '../theme/neumorphic.ts';
import { radius, spacing, type } from '../theme/tokens.ts';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
  disabled?: boolean;
  style?: ViewStyle;
}

/** Raised neumorphic button; press = inset (DESIGN.md "Buttons"). */
export function Button({ label, onPress, variant = 'solid', disabled, style }: ButtonProps) {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed: isPressed }) => [
        styles.base,
        raised(palette, 6),
        variant === 'ghost' && { backgroundColor: 'transparent', shadowOpacity: 0, elevation: 0 },
        isPressed && pressed(palette),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Text style={[styles.label, { color: palette.text }]}>{label.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // a11y touch target
  },
  label: { ...type.label },
  disabled: { opacity: 0.45 },
});
