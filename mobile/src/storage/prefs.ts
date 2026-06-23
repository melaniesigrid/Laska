/**
 * Non-secret preferences (theme, piece insignia, streak cache) — AsyncStorage.
 * NEVER store auth tokens here; use storage/secureTokens.ts for those.
 *
 * VERIFY @react-native-async-storage/async-storage API for the installed version.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function getPref<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export async function setPref<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // best-effort; prefs are non-critical
  }
}
