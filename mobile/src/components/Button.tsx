import React from 'react';
import { Pressable, Text, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { raised, inset, pressed } from '../theme/neumorphic.ts';
import { radius, spacing, type } from '../theme/tokens.ts';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'solid' | 'ghost';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Raised neumorphic button; held = inset, the web's `.btn:active` (DESIGN.md). */
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
        variant === 'solid' && raised(palette, 6),
        // Ghost resting = a shallow recessed slot (not bare text), so the 48pt
        // tap target is discoverable while staying on-brand (no hard borders).
        variant === 'ghost' && inset(palette, 2.5),
        // Both variants sink to a deeper inset when held — the tactile press.
        isPressed && !disabled && pressed(palette, variant === 'ghost' ? 4 : 5),
        isPressed && !disabled && styles.sink,
        disabled && styles.disabled,
        style,
      ]}
    >
      {({ pressed: isPressed }) => (
        <Text
          style={[
            styles.label,
            { color: isPressed && !disabled ? palette.accent : palette.btnInk },
          ]}
        >
          {label.toUpperCase()}
        </Text>
      )}
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
  sink: { transform: [{ translateY: 1 }] }, // web nudges 1px on :active
  label: { ...type.label },
  disabled: { opacity: 0.45 },
});
