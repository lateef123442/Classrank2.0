module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo ships inside the `expo` package. Since Reanimated 4 it also configures the
    // react-native-worklets plugin automatically — do NOT add "react-native-reanimated/plugin" here
    // (that plugin was removed in Reanimated 4 and would crash the bundler).
    presets: ["babel-preset-expo"],
  };
};
