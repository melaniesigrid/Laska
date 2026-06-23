/**
 * App root: providers (safe-area, gesture-handler, theme) + error boundary +
 * navigation. Entry is index.js → registerRootComponent(App).
 */
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider } from './theme/ThemeProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { RootNavigator } from './navigation/index.tsx';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ErrorBoundary>
            <StatusBar style="auto" />
            <RootNavigator />
          </ErrorBoundary>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
