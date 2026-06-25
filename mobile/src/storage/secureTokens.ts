/**
 * Secure token storage — Keychain (iOS) / Keystore (Android) backed via
 * expo-secure-store. Auth tokens NEVER go in AsyncStorage/plain storage.
 *
 * This is the native replacement for the web client's `localStorage`-based token
 * persistence (web/src/net/client.ts). SecureStore is async, so the API here is
 * Promise-based; the ported LaskaClient is built around that.
 *
 * VERIFY expo-secure-store's API (getItemAsync/setItemAsync/deleteItemAsync) for
 * the installed SDK version.
 */
import * as SecureStore from 'expo-secure-store';

const TOKENS_KEY = 'laska.tokens'; // mirrors the web STORAGE_KEY

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AsyncTokenStore {
  load(): Promise<AuthTokens | null>;
  save(tokens: AuthTokens | null): Promise<void>;
}

export const secureTokenStore: AsyncTokenStore = {
  async load() {
    try {
      const raw = await SecureStore.getItemAsync(TOKENS_KEY);
      return raw ? (JSON.parse(raw) as AuthTokens) : null;
    } catch {
      return null;
    }
  },
  async save(tokens) {
    if (tokens) {
      await SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens));
    } else {
      await SecureStore.deleteItemAsync(TOKENS_KEY);
    }
  },
};
