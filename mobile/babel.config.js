// VERIFY: react-native-reanimated's babel plugin MUST be listed last. Its name
// and requirement are version-specific — confirm against the installed
// react-native-reanimated docs (older SDKs used 'react-native-reanimated/plugin';
// newer setups fold it into 'babel-preset-expo'). Adjust to match your version.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Keep reanimated's plugin LAST if your version still requires it explicitly.
      'react-native-reanimated/plugin',
    ],
  };
};
