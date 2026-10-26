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

/** Creates an account through the real sign-up form, then makes sure the browser ends up signed in on Home. */
export async function signUpAndIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('confirmation link');

  // Local Supabase has email confirmation switched off, so the sign-up may already have started a session.
  await page.goto('/login');
  if (new URL(page.url()).pathname === '/login') {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
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
