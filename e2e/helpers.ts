import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const PASSWORD = 'e2e-password-123';

export function uniqueEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

export function apiHeaders(token?: string): Record<string, string> {
  return { apikey: ANON_KEY, Authorization: `Bearer ${token ?? ANON_KEY}`, 'Content-Type': 'application/json' };
}

/** Creates a test account through the test-build email form, then makes sure the browser ends up signed in on Home. */
export async function signUpAndIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create a test account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create test account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('confirmation link');

  // Local Supabase has email confirmation switched off, so the sign-up may already have started a session.
  await page.goto('/login');
  if (new URL(page.url()).pathname === '/login') {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  }
  await expect(page).toHaveURL(/localhost:3000\/$/);
}

export async function passwordToken(request: import('@playwright/test').APIRequestContext, email: string): Promise<{ token: string; userId: string }> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password: PASSWORD },
  });
  expect(res.ok(), 'password grant should work for the e2e user').toBeTruthy();
  const body = (await res.json()) as { access_token: string; user: { id: string } };
  return { token: body.access_token, userId: body.user.id };
}

/** Creates an account straight through the auth API (local Supabase has email confirmation off) and returns its token. */
export async function createApiUser(request: import('@playwright/test').APIRequestContext, tag: string): Promise<{ token: string; userId: string; email: string }> {
  const email = uniqueEmail(tag);
  const res = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password: PASSWORD },
  });
  expect(res.ok(), 'API sign-up should work on the local stack').toBeTruthy();
  const { token, userId } = await passwordToken(request, email);
  return { token, userId, email };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs one SQL statement as the database owner (psql must be installed). Only for checking results, never for setup that the app itself should do. */
export function sql(query: string): string {
  const url = process.env.E2E_PGURL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  return execFileSync('psql', [url, '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}

export const SONG_ONE_ID = 'd0000000-0000-0000-0000-000000000001'; // live, on the album "Morning Light", has a (working) YouTube link
export const SONG_TWO_ID = 'd0000000-0000-0000-0000-000000000002'; // hidden: its artist's agreement is incomplete
export const SINGLE_ID = 'd0000000-0000-0000-0000-000000000004'; // live, no album, its YouTube link failed its check

/** A silent mono 8-bit WAV file. Tiny, valid, and playable in headless Chromium. */
export function silentWav(seconds: number, sampleRate = 8000): Buffer {
  const dataLen = seconds * sampleRate;
  const buf = Buffer.alloc(44 + dataLen, 0x80); // 8-bit PCM silence is 0x80
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate, 28); // bytes per second
  buf.writeUInt16LE(1, 32); // bytes per sample frame
  buf.writeUInt16LE(8, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

let adminCache: { token: string; userId: string } | null = null;

/** An administrator, made the way the real one will be: a normal account whose profile role is then set in the database. */
export async function adminUser(request: import('@playwright/test').APIRequestContext): Promise<{ token: string; userId: string }> {
  if (adminCache) return adminCache;
  const u = await createApiUser(request, 'audio-admin');
  sql(`update public.profiles set role = 'admin' where id = '${u.userId}'`);
  adminCache = { token: u.token, userId: u.userId };
  return adminCache;
}

/** Gives a song a hosted audio file the way the admin site will: upload to the private bucket, then record the path on the song.
 *  Safe to call twice; the second call does nothing. Returns the storage path. */
export async function ensureAudio(request: import('@playwright/test').APIRequestContext, songId: string, seconds = 120): Promise<string> {
  const existing = sql(`select coalesce(audio_path, '') from public.songs where id = '${songId}'`);
  if (existing) return existing;
  const admin = await adminUser(request);
  const path = `${songId}/e2e-silence.wav`;
  const wav = silentWav(seconds);
  const res = await request.post(`${SUPABASE_URL}/storage/v1/object/audio/${path}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${admin.token}`, 'Content-Type': 'audio/wav', 'x-upsert': 'true' },
    data: wav,
  });
  expect(res.ok(), `admin upload to the audio bucket failed: ${res.status()} ${await res.text()}`).toBeTruthy();
  sql(`update public.songs set audio_path = '${path}', audio_mime = 'audio/wav', audio_bytes = ${wav.length} where id = '${songId}'`);
  return path;
}

/** Seconds the page's audio element has played to, or -1 when there is none. */
export async function audioTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('audio');
    return el ? el.currentTime : -1;
  });
}

/** A normal account made an admin the way the real one is: the role is set in the database, never through the site.
 *  The browser ends up signed in on Home; the role is read on every request, so /admin works at once. */
export async function signInAsAdmin(page: Page): Promise<{ email: string; userId: string }> {
  const email = uniqueEmail('admin-ui');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  sql(`update public.profiles set role = 'admin' where id = '${userId}'`);
  return { email, userId };
}

export const GRACE_ID = 'a0000000-0000-0000-0000-000000000001'; // published, agreement in force (audio hosting allowed)
export const SHALOM_ID = 'a0000000-0000-0000-0000-000000000002'; // published, agreement expired

/** A silent MP3: whole MPEG-1 Layer III frames (128 kbps, 44.1 kHz, stereo) with nothing in them. 417 bytes and about 26 ms each.
 *  Tiny, valid, and its length (frames x 26 ms) can be worked out from the file size alone, as a browser does for such files. */
export function silentMp3(frames: number): Buffer {
  const frameBytes = 417;
  const buf = Buffer.alloc(frameBytes * frames, 0);
  for (let i = 0; i < frames; i++) buf.set([0xff, 0xfb, 0x90, 0x00], i * frameBytes);
  return buf;
}
