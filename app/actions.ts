'use server';

import { signIn, signOut } from '../lib/next-auth';

export async function loginToFerrowork() {
  await signIn('ferrowork', { redirectTo: '/' });
}

export async function loginToFerroSign() {
  await signIn('ferrowork', { redirectTo: '/?ferrosign_sso=complete' });
}

export async function loginToFerroAI() {
  await signIn('ferrowork', { redirectTo: '/ferroai' });
}

export async function loginToPrinterLab() {
  await signIn('ferrowork', { redirectTo: '/printer-lab' });
}

export async function logoutOfFerrowork() {
  await signOut({ redirectTo: '/' });
}
