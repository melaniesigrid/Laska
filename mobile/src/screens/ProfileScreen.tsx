/**
 * Profile / settings stub. The store-compliance items that LIVE here are
 * flagged (account deletion is a hard store requirement once accounts exist).
 * Push permission is requested contextually from here or after a match, never
 * on cold launch. See ../../MOBILE.md store-readiness checklist.
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { spacing, type } from '../theme/tokens.ts';

export function ProfileScreen() {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ backgroundColor: palette.ground }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
    >
      <Text style={[styles.title, { color: palette.text }]}>Profile</Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>
        Scaffold. To be built: account (link guest → email), rating + streak, theme
        and piece-insignia picker, push-notification opt-in (contextual), and an
        in-app Delete Account flow.
      </Text>
      <View style={styles.note}>
        <Text style={[styles.body, { color: palette.textMuted }]}>
          • Delete Account is a store requirement once accounts exist (needs a
          server DELETE /account endpoint — not built yet).{'\n'}
          • Push opt-in must be requested in context, with graceful denial.{'\n'}
          • Streak UI depends on web/src/streak.ts reaching main.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...type.title },
  body: { ...type.body },
  note: { marginTop: spacing.md, gap: spacing.xs },
});
