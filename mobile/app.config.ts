import { ExpoConfig } from 'expo/config';

// Expo app config. VERIFY plugin names/options and the icon/splash schema
// against the installed Expo SDK docs — these keys shift between SDKs.
//
// Bundle identifiers are placeholders; reserve the real ones in App Store Connect
// / Play Console once developer accounts exist (ACCOUNT-GATED — see ../MOBILE.md).

const config: ExpoConfig = {
  name: 'Laska',
  slug: 'laska',
  version: '0.1.0',
  orientation: 'portrait',
  scheme: 'laska', // deep links: laska://
  userInterfaceStyle: 'automatic',
  // icon: './assets/icon.png',           // TODO: add 1024x1024 icon
  // splash configured via expo-splash-screen plugin below once assets exist.
  ios: {
    bundleIdentifier: 'com.northbound.laska', // PLACEHOLDER — reserve real id
    supportsTablet: false, // phone-first for v1
    infoPlist: {
      // Push has no usage-description string; add ones here only for
      // capabilities v1 actually uses. No camera/photos/location in v1.
    },
  },
  android: {
    package: 'com.northbound.laska', // PLACEHOLDER — reserve real id
    adaptiveIcon: {
      // foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#e8e4db', // Stone --ground (see DESIGN.md)
    },
  },
  plugins: [
    // VERIFY each plugin name/version for the installed SDK.
    'expo-secure-store',
    [
      'expo-notifications',
      {
        // icon: './assets/notification-icon.png',
        color: '#5f8c7e', // eucalyptus accent
      },
    ],
  ],
  extra: {
    // Backend base URLs. Override per build profile via EAS env or app config.
    // VERIFY the production Railway host before shipping.
    apiBase: process.env.LASKA_API_BASE ?? 'http://localhost:8080',
    wsUrl: process.env.LASKA_WS_URL ?? 'ws://localhost:8080',
  },
};

export default config;
