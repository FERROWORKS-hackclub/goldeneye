import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

export const authClient = createAuthClient({
  baseURL: 'https://auth.ferroworks.org',
  plugins: [expoClient({ scheme: 'goldeneye', storagePrefix: 'goldeneye', storage: SecureStore })],
});

export async function sessionCookie() {
  return authClient.getCookie();
}
