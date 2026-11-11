import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'delco.refreshToken';

/** The refresh token lives only in the OS keystore (SecureStore). The access token stays in memory. */
export const sessionStorage = {
  get: async (): Promise<string | null> => {
    if (Platform.OS === 'web') return null;
    try {
      return await SecureStore.getItemAsync(KEY);
    } catch {
      return null;
    }
  },
  set: async (token: string) => {
    if (Platform.OS !== 'web') await SecureStore.setItemAsync(KEY, token);
  },
  clear: async () => {
    if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(KEY).catch(() => {});
  },
};
