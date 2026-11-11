/** Simulates network latency and returns a copy so screens never mutate mock state directly. */
export const mock = <T>(value: T, ms = 350): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value === undefined ? value : JSON.parse(JSON.stringify(value))), ms));

export const mockError = (message: string, ms = 350): Promise<never> =>
  new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));

export const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}`;

export * as db from './data';
