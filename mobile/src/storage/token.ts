import * as SecureStore from 'expo-secure-store';

const KEY = 'nutrientlog.token';

/**
 * The login token lives in the iPhone's secure storage (the Keychain). Storage problems are
 * treated as "no token": the worst case is the person fills in the survey again.
 */
export async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

export async function storeToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {
    // Ignored on purpose, see above.
  }
}

export async function clearStoredToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Ignored on purpose, see above.
  }
}
