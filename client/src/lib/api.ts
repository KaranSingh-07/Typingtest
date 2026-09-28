import type { Me } from '../../../shared/protocol';

const TOKEN_KEY = 'tf_token';

const storage = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode: the session just won't persist */
    }
  },
};

export const getToken = () => storage.get(TOKEN_KEY);
export const clearToken = () => storage.set(TOKEN_KEY, null);

export async function register(roll: string, name: string, username: string): Promise<{ me: Me; token: string }> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roll, name, username }),
  });
  const body = await res.json().catch(() => ({ error: 'Server error' }));
  if (!res.ok) throw new Error(body.error || 'Registration failed');
  storage.set(TOKEN_KEY, body.token);
  return body;
}

export async function fetchMe(token: string): Promise<Me | null> {
  const res = await fetch('/api/me', { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error('Server unavailable');
  return (await res.json()).me;
}

export const bestKey = (userId: number) => `tf_best_${userId}`;
export const getBest = (userId: number) => Number(storage.get(bestKey(userId)) || 0);
export const setBest = (userId: number, wpm: number) => storage.set(bestKey(userId), String(wpm));
