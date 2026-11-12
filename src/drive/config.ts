import { getSetting, setSetting } from '../store/db';

export const GOOGLE_CLIENT_ID_KEY = 'googleClientId';

export function normaliseClientId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function builtInGoogleClientId(): string {
  return normaliseClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

export async function storedGoogleClientId(): Promise<string> {
  try {
    return normaliseClientId(await getSetting<unknown>(GOOGLE_CLIENT_ID_KEY, ''));
  } catch {
    return '';
  }
}

export async function readGoogleClientId(): Promise<string> {
  return (await storedGoogleClientId()) || builtInGoogleClientId();
}

export async function saveGoogleClientId(value: string): Promise<void> {
  await setSetting(GOOGLE_CLIENT_ID_KEY, value.trim());
}
