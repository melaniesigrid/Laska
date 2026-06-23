# Laska Mobile (React Native / Expo)

Native iOS + Android app for Laska. See [`../MOBILE.md`](../MOBILE.md) for the full
architecture, reuse map, and store-readiness plan.

This directory is a **scaffold**. The shared rules engine (`../src`) and protocol
types (`../server/src/net/protocol.ts`) are imported directly via Metro
`watchFolders` — they are shared, not copied.

## Bootstrap (do this once)

> **Why these steps and not a checked-in lockfile:** the Expo SDK and its peer
> libraries are version-locked to each other and move fast. Always let
> `npx expo install` resolve the SDK-correct versions rather than trusting the
> ranges in `package.json` (which are a target, not a guarantee). VERIFY the
> current Expo SDK before starting.

```bash
cd mobile

# 1. Install the SDK + React/React Native at SDK-correct versions.
#    If the pinned expo version in package.json is stale, run
#    `npx create-expo-app@latest` in a temp dir and copy its expo/react versions.
npm install

# 2. Let Expo pin every native dependency to versions matching the installed SDK.
npx expo install \
  expo-secure-store @react-native-async-storage/async-storage \
  expo-notifications expo-device expo-constants \
  react-native-svg react-native-reanimated react-native-gesture-handler \
  react-native-safe-area-context react-native-screens \
  @react-navigation/native @react-navigation/native-stack @react-navigation/bottom-tabs

# 3. Run it.
npx expo start            # dev (Expo Go works until a custom native module is added)
```

When push notifications or any custom native module is wired, switch from Expo Go
to a **dev-client** build (`npx expo run:ios` / `run:android`, or an EAS dev build).
VERIFY against current Expo docs.

## Project layout

See [`../MOBILE.md`](../MOBILE.md#project-structure-monorepo-shared-engine).

## What is NOT done here (by design — scaffold only)

- No developer accounts yet → no EAS Build/Submit, no store submission. `eas.json`
  is staged; every account-gated step is flagged in `../MOBILE.md`.
- Push backend endpoint (`POST /push/register`) and account-deletion endpoint
  don't exist server-side yet; the client degrades gracefully.
- Streak UI depends on `web/src/streak.ts` landing on `main`.
