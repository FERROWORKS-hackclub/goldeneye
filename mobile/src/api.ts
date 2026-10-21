import { sessionCookie } from './auth-client';

const API = 'https://goldeneye.ferroworks.org';
export async function getWorkspace() {
  const cookie = await sessionCookie();
  const response = await fetch(`${API}/api/workspace`, { headers: { Cookie: cookie || '' }, credentials: 'omit' });
  if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again.' : 'Could not load your workspace.');
  return response.json();
}

export async function updateWorkspace(kind: string, action: string, data: Record<string, unknown>, id?: string) {
  const cookie = await sessionCookie();
  const response = await fetch(`${API}/api/workspace`, {
    method: 'POST', credentials: 'omit',
    headers: { Cookie: cookie || '', Origin: API, 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, action, data, id }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save this change.');
  return result;
}
