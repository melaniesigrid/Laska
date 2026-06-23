import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * Top-level error boundary so a render crash shows a recoverable screen instead
 * of a white screen. Production hardening: wire a crash reporter here (e.g.
 * Sentry — VERIFY current Expo/RN setup) in componentDidCatch.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // TODO: report to crash reporter (Sentry/Crashlytics).
    console.error('Uncaught render error:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.wrap}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.msg}>{this.state.error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#e8e4db' },
  title: { fontSize: 20, fontWeight: '600', color: '#4b463c', marginBottom: 8 },
  msg: { fontSize: 14, color: '#8a8475', textAlign: 'center' },
});
