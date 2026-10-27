// Small helpers about the signed-in person. No dependencies, so they can be tested directly.

/** The profile picture from the person's Google account, or null. Only https pictures are used. */
export function pictureFromMetadata(meta: unknown): string | null {
  if (typeof meta !== 'object' || meta === null) return null;
  const m = meta as Record<string, unknown>;
  const candidate = typeof m.avatar_url === 'string' ? m.avatar_url : typeof m.picture === 'string' ? m.picture : null;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** How the person signed in, in words. The e-mail form exists only in test builds. */
export function signInMethodLabel(provider: unknown): string {
  if (provider === 'google') return 'Google';
  if (provider === 'email') return 'Email and password (test account)';
  return typeof provider === 'string' && provider !== '' ? provider : 'Unknown';
}
