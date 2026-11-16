import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STUBS = { 'expo-secure-store': 'secure-store.mjs', 'react-native': 'react-native.mjs', 'expo-constants': 'expo-constants.mjs' };

export async function resolve(specifier, context, next) {
  if (STUBS[specifier]) return { url: new URL(`./stubs/${STUBS[specifier]}`, import.meta.url).href, shortCircuit: true };
  if (specifier.startsWith('.') && context.parentURL && !/\.[cm]?[jt]sx?$/.test(specifier)) {
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      const url = new URL(specifier + ext, context.parentURL);
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true };
    }
  }
  return next(specifier, context);
}
