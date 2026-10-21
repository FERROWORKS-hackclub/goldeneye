'use server';

import { signIn } from '../lib/next-auth';

export async function loginToFerrowork() {
  await signIn('ferrowork', { redirectTo: '/' });
}
