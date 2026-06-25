// Expo SDK 54: babel-preset-expo automatically applies the react-native-worklets
// babel plugin (required by Reanimated 4), so it must NOT be listed manually here.
// Reanimated 4 replaced 'react-native-reanimated/plugin' with the worklets plugin;
// adding either by hand causes a duplicate/missing-module error.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
