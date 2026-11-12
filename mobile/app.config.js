// Extends app.json with values that must come from the environment (never committed).
// GOOGLE_MAPS_API_KEY: restrict it to the Android package + SHA-1 / iOS bundle id, Maps SDK only (assignment §3.2).
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    android: {
      ...config.android,
      permissions: ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'CAMERA'],
      ...(mapsKey ? { config: { googleMaps: { apiKey: mapsKey } } } : {}),
    },
    ios: {
      ...config.ios,
      ...(mapsKey ? { config: { googleMapsApiKey: mapsKey } } : {}),
    },
    plugins: [
      ...(config.plugins ?? []),
      ['expo-location', { locationWhenInUsePermission: 'Delco Chefs uses your location to pin your address, and for chefs to share live travel location and check in at the customer’s home.' }],
      ['expo-image-picker', { cameraPermission: 'Chefs take a check-in selfie and food photos to complete a visit.', photosPermission: 'Chefs attach identity documents to their application.' }],
    ],
  };
};
