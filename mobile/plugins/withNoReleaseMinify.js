// R8 minification breaks WorkManager's Room database (pulled in by expo-location / expo-task-manager):
// release builds crash at launch with "Failed to create an instance of class androidx.work.impl.WorkDatabase".
// Keep release builds unminified so local and EAS builds start reliably.
const { withGradleProperties } = require('expo/config-plugins');

module.exports = (config) =>
  withGradleProperties(config, (cfg) => {
    const key = 'android.enableMinifyInReleaseBuilds';
    cfg.modResults = cfg.modResults.filter((p) => !(p.type === 'property' && p.key === key));
    cfg.modResults.push({ type: 'property', key, value: 'false' });
    return cfg;
  });
