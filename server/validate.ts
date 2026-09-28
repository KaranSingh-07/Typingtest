// Shared by registration and the admin "edit player" tool.
const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export type Profile = { roll: string; name: string; username: string };

export function validateProfile(input: { roll?: unknown; name?: unknown; username?: unknown }): { ok: true; value: Profile } | { ok: false; error: string } {
  const roll = clean(input.roll, 24).toUpperCase();
  const name = clean(input.name, 60);
  const username = clean(input.username, 16);
  if (!/^[A-Z0-9/_-]{3,24}$/.test(roll)) return { ok: false, error: 'Enter a valid roll number (letters, digits, / or -).' };
  if (!/^[\p{L} .'-]{2,60}$/u.test(name)) return { ok: false, error: 'Enter your full name (letters only).' };
  if (!/^[A-Za-z0-9_.]{3,16}$/.test(username)) return { ok: false, error: 'Username must be 3-16 characters: letters, digits, _ or .' };
  return { ok: true, value: { roll, name, username } };
}
