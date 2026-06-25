/**
 * App root: providers (safe-area, gesture-handler, theme) + error boundary +
 * navigation. Entry is index.js → registerRootComponent(App).
 *
 * Fonts (Fraunces display + Hanken Grotesk body — DESIGN.md) load here via
 * expo-font; render is gated until they're ready so the UI never flashes the
 * system fallback. Each weight is a separate baked family (custom fonts don't
 * synthesize weight on RN) — keep these in sync with theme/tokens.ts `fonts`.
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { HankenGrotesk_400Regular, HankenGrotesk_600SemiBold } from '@expo-google-fonts/hanken-grotesk';
import { ThemeProvider } from './theme/ThemeProvider.tsx';
import { OnlineProvider } from './online/OnlineProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { RootNavigator } from './navigation/index.tsx';

export default function App() {
  const [fontsLoaded] = useFonts({
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_600SemiBold,
  });

  // Keep the splash up until the type is ready (avoids a system-font flash).
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <OnlineProvider>
            <ErrorBoundary>
              <StatusBar style="auto" />
              <RootNavigator />
            </ErrorBoundary>
          </OnlineProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
