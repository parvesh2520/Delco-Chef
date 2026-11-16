// Windows only: CMake/ninja object paths embed the full source path, and the SDK's ninja (1.10) cannot create
// directories past 260 characters. From "C:\Users\<name>\Desktop\Delco Chef\delco-chefs\mobile\node_modules\…" the
// native libraries (react-native-screens, expo-modules-core…) fail with "ninja: error: mkdir(...): No such file or
// directory". Moving each module's .cxx staging folder to a short root keeps every path under the limit.
// Registered in settings.gradle so it runs before React Native's root plugin starts evaluating modules.
const { withSettingsGradle } = require('expo/config-plugins');

const MARKER = '// @delco/short-native-build-dir';
const SNIPPET = [
  '',
  MARKER,
  "if (System.getProperty('os.name').toLowerCase().contains('windows')) {",
  '  gradle.beforeProject { p ->',
  "    ['com.android.library', 'com.android.application'].each { id ->",
  '      p.plugins.withId(id) {',
  '        p.android.externalNativeBuild.cmake.buildStagingDirectory = new File("C:/rn/" + p.name)',
  '      }',
  '    }',
  '  }',
  '}',
  '',
].join('\n');

module.exports = (config) =>
  withSettingsGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) cfg.modResults.contents += SNIPPET;
    return cfg;
  });
