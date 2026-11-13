// Extends app.json with values that must come from the environment (never committed).
// GOOGLE_MAPS_API_KEY: restrict it to the Android package + SHA-1 / iOS bundle id, Maps SDK only (assignment §3.2).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    android: {
      ...config.android,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_LOCATION', 'POST_NOTIFICATIONS'],
      blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
      ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}),
    },
    ios: {
      ...config.ios,
      ...(mapsKey ? { config: { googleMapsApiKey: mapsKey } } : {}),
    },
    extra: { ...config.extra, googleMapsConfigured: Boolean(mapsKey) },
    plugins: [
      ...(config.plugins ?? []),
      // Part E1: chefs share location during travel through a user-started foreground service (visible notification).
      // That needs only "while using the app" permission, so ACCESS_BACKGROUND_LOCATION is deliberately NOT requested.
      ['expo-location', {
        locationWhenInUsePermission: 'Delco Chefs uses your location to pin your address, and for chefs to share live travel location and check in at the customer’s home.',
        isAndroidForegroundServiceEnabled: true,
        isAndroidBackgroundLocationEnabled: false,
      }],
      ['expo-image-picker', { cameraPermission: 'Chefs take a check-in selfie and food photos to complete a visit.', photosPermission: 'Chefs attach identity documents to their application.' }],
    ],
  };
};
