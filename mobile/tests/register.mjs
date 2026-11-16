// Runs the auth-session unit tests under plain Node (no Jest/Metro): stubs native modules and resolves extensionless TS imports.
import { register } from 'node:module';

globalThis.__DEV__ = true;
process.env.EXPO_PUBLIC_API_URL = 'http://api.test/api/v1';
register('./resolve.mjs', import.meta.url);
