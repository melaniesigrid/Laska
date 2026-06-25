/**
 * Profile / account. Reads the SHARED online session (OnlineProvider), so it
 * reflects the same user/rating/connection as the Online tab.
 *
 * Built here:
 *  - account card (username, rating, rated games, guest vs. email, connection);
 *  - "Save your account" — upgrade a guest to a permanent email/password login
 *    (client.linkGuest), so progress/rating survives a reinstall;
 *  - theme toggle (Stone / Dark);
 *  - sign out.
 *
 * Deliberately NOT built yet (honest gaps, see ../../MOBILE.md):
 *  - Delete Account needs a server `DELETE /account` endpoint (another lane);
 *    shown but disabled until it exists, rather than a button that always fails.
 *  - Push opt-in is requested contextually (after a match), not from here.
 *  - Streak UI depends on web/src/streak.ts reaching main.
 */
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/Button.tsx';
import { Surface } from '../components/Surface.tsx';
import { useTheme } from '../theme/ThemeProvider.tsx';
import { inset } from '../theme/neumorphic.ts';
import { spacing, radius, type, PALETTE_ORDER, type Palette } from '../theme/tokens.ts';
import { useOnlineSession } from '../online/OnlineProvider.tsx';

export function ProfileScreen() {
  const { palette, name, setPalette } = useTheme();
  const insets = useSafeAreaInsets();
  const online = useOnlineSession();
  const user = online.user;

  return (
    <ScrollView
      style={{ backgroundColor: palette.backdrop }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: palette.text }]}>Profile</Text>

      {!user ? (
        <Surface>
          <Text style={[styles.body, { color: palette.textMuted }]}>
            You're not signed in. Jump in instantly as a guest, then save your
            account here to keep your rating.
          </Text>
          <Button label="Play as guest" onPress={online.guest} />
        </Surface>
      ) : (
        <Surface>
          <Text style={[styles.name, { color: palette.text }]}>{user.username}</Text>
          <Text style={[styles.body, { color: palette.textMuted }]}>
            {user.isGuest ? 'Guest account' : user.email ?? 'Account'}
            {' · '}
            <Text style={{ color: online.status === 'connected' ? palette.accent : palette.textMuted }}>
              {online.status}
            </Text>
          </Text>
          <View style={styles.stats}>
            <Stat label="Rating" value={String(user.rating)} palette={palette} />
            <Stat label="Rated games" value={String(user.ratedGames)} palette={palette} />
          </View>
        </Surface>
      )}

      {user?.isGuest && <LinkAccount online={online} palette={palette} />}

      <Text style={[styles.section, { color: palette.textMuted }]}>Theme</Text>
      <View style={styles.themes}>
        {PALETTE_ORDER.map((p) => (
          <Button
            key={p.name}
            label={p.label}
            variant={name === p.name ? 'solid' : 'ghost'}
            onPress={() => setPalette(p.name)}
            style={styles.themeBtn}
          />
        ))}
      </View>

      {user && (
        <>
          <Text style={[styles.section, { color: palette.textMuted }]}>Account</Text>
          <Button label="Sign out" variant="ghost" onPress={online.logout} />
          <View style={styles.gated}>
            <Button label="Delete account" variant="ghost" onPress={() => {}} disabled />
            <Text style={[styles.fine, { color: palette.textMuted }]}>
              Account deletion (a store requirement) ships once the server exposes
              DELETE /account.
            </Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Stat({ label, value, palette }: { label: string; value: string; palette: Palette }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: palette.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: palette.textMuted }]}>{label}</Text>
    </View>
  );
}

function LinkAccount({
  online,
  palette,
}: {
  online: ReturnType<typeof useOnlineSession>;
  palette: Palette;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
    <Surface>
      <Text style={[styles.section, { color: palette.textMuted, marginTop: 0 }]}>Save your account</Text>
      <Text style={[styles.body, { color: palette.textMuted }]}>
        Add an email and password so your rating survives a reinstall or new device.
      </Text>
      {field('Username', username, setUsername, { autoComplete: 'username', textContentType: 'username' })}
      {field('Email', email, setEmail, { autoComplete: 'email', keyboardType: 'email-address', textContentType: 'emailAddress' })}
      {field('Password', password, setPassword, { secureTextEntry: true, autoComplete: 'password-new', textContentType: 'newPassword' })}
      {online.error && <Text style={[styles.body, { color: palette.danger }]}>{online.error}</Text>}
      <Button label="Save account" onPress={() => online.linkGuest(email, password, username)} />
    </Surface>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  title: { ...type.title },
  body: { ...type.body },
  section: { ...type.label, marginTop: spacing.lg },
  name: { ...type.title, fontSize: 22 },
  stats: { flexDirection: 'row', gap: spacing.xl },
  stat: { gap: spacing.xs },
  statValue: { ...type.status, fontVariant: ['tabular-nums'] },
  statLabel: { ...type.label },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  themeBtn: { flexGrow: 1, minWidth: 96 },
  field: { gap: spacing.xs },
  fieldLabel: { ...type.label },
  input: {
    ...type.body,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: 48,
  },
  gated: { gap: spacing.xs },
  fine: { ...type.body, fontSize: 13 },
});
