import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { auth } from './auth';
import { db } from './server';
import { staffRole } from './ferrosign-validation.mjs';

export type SignField = { id: string; type: 'signature'|'date'|'number'|'sentence'|'word'; label: string; page: number; x: number; y: number; width: number; height: number; required: boolean };
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const token = () => randomBytes(32).toString('base64url');
export const id = () => randomUUID();
export async function currentUser() {
 const session = await auth().getSession(); if (!session) return null;
 const [user] = await db()`SELECT id,email,name,role FROM fw_users WHERE id=${session.user.sub} AND active=true`;
 return user || null;
}
export const staff = staffRole;
export function appOrigin() { return (process.env.FERROSIGN_BASE_URL || process.env.APP_BASE_URL?.split(',').find(x=>x.startsWith('https://sign.')) || 'https://sign.ferroworks.org').replace(/\/$/,''); }
