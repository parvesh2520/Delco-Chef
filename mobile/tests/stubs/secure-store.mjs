// In-memory stand-in for the Android Keystore-backed SecureStore.
export const store = new Map();
globalThis.__secureStore = store;
export const getItemAsync = async (k) => (store.has(k) ? store.get(k) : null);
export const setItemAsync = async (k, v) => void store.set(k, v);
export const deleteItemAsync = async (k) => void store.delete(k);
