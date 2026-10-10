import Constants from 'expo-constants';

/** The backend listens on this port (see docker-compose.yml). */
export const API_PORT = 8000;

/**
 * Pull the computer's address out of the Expo dev server address.
 * "192.168.1.5:8081" and "exp://192.168.1.5:8081" both give "192.168.1.5".
 */
export function hostFromHostUri(hostUri: string | null | undefined): string | null {
  if (!hostUri) return null;
  const withoutScheme = hostUri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const host = withoutScheme.split('/')[0].split(':')[0];
  return host.length > 0 ? host : null;
}

/**
 * Where the backend lives.
 *  1. EXPO_PUBLIC_API_URL, if set (use this to point at a specific server).
 *  2. Otherwise the computer running the Expo dev server, which is also the computer running
 *     the backend while developing. Expo Go on the phone already knows that address.
 *  3. Otherwise localhost (only useful in a simulator or the web build).
 */
export function resolveApiBaseUrl(options: {
  envUrl?: string | undefined;
  hostUri?: string | null | undefined;
}): string {
  const envUrl = options.envUrl?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, '');
  const host = hostFromHostUri(options.hostUri) ?? 'localhost';
  return `http://${host}:${API_PORT}`;
}

export function getApiBaseUrl(): string {
  return resolveApiBaseUrl({
    // Must be written out in full so Expo can substitute it when the app is bundled.
    envUrl: process.env.EXPO_PUBLIC_API_URL,
    hostUri: Constants.expoConfig?.hostUri,
  });
}
