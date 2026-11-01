import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const WEEKLY_WORKLOG_TEMPLATE_TITLE = 'Ferrowork Weekly Development Work Log';
const UNLOCK_CODE_HASH = 'b8d07ead18dedcd1e839dffb5e3484d5530ef529ebc7a81214bdc86981347d42';
const TOKEN_TTL_MS = 10 * 60 * 1000;

export function lockedTemplateKey(title, detail = {}) {
  if (detail?.locked === true || detail?.builtinKey === 'weekly-worklog') return detail?.builtinKey || 'protected-template';
  const normalized = String(title || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized === WEEKLY_WORKLOG_TEMPLATE_TITLE.toLowerCase()) return 'weekly-worklog';
  if (normalized === 'ferrowork contractor agreement - 2027') return 'contractor-agreement-2027';
  return null;
}

export function checkTemplateUnlockCode(code) {
  const supplied = createHash('sha256').update(String(code || '')).digest();
  const expected = Buffer.from(UNLOCK_CODE_HASH, 'hex');
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createTemplateUnlockToken(id, userId, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id, userId, expiresAt: now + TOKEN_TTL_MS })).toString('base64url');
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyTemplateUnlockToken(token, id, userId, secret, now = Date.now()) {
  if (typeof token !== 'string' || !secret) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return false; }
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.id === id && decoded.userId === userId && Number(decoded.expiresAt) > now;
  } catch { return false; }
}
