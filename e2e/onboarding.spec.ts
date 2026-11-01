// The first sign-in step: a NEW account is asked for its languages and region once, right after Google sign-in (the callback sends it to
// /onboarding). The Google sign-in itself cannot run in a test, so these open /onboarding the way the callback does, with the page to
// go to afterwards in ?next=. Runs on the real Supabase stack.
import { expect, test } from '@playwright/test';
import { SUPABASE_URL, apiHeaders, createApiUser, signUpAndIn, sql, uniqueEmail } from './helpers';

const profile = (userId: string, columns: string) => sql(`select ${columns} from public.profiles where id = '${userId}'`);

test('a new account chooses its languages and region, and lands on the page it asked for', async ({ page }) => {
  const email = uniqueEmail('onboard');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  expect(profile(userId, 'onboarded_at is null'), 'a new account has not done the first step').toBe('t');

  await page.goto('/onboarding?next=%2Fsettings%2Fabout');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Welcome');
  const continueButton = page.getByRole('button', { name: 'Continue' });
  await expect(continueButton, 'nothing chosen yet').toBeDisabled();
  await expect(page.getByRole('button', { name: 'Skip for now' })).toBeEnabled();

  await page.getByLabel(/Tamil/).check();
  await page.getByLabel('English').check();
  await expect(continueButton).toBeEnabled();
  await page.getByLabel('Region').selectOption('IN-TN');
  await continueButton.click();

  await expect(page).toHaveURL(/\/settings\/about$/);
  expect(profile(userId, `language_codes @> '{ta,en}' and cardinality(language_codes) = 2`)).toBe('t');
  expect(profile(userId, 'region_code')).toBe('IN-TN');
  expect(profile(userId, 'onboarded_at is not null'), 'the step is marked done').toBe('t');

  // It is not asked again: the page sends the person straight on.
  await page.goto('/onboarding?next=%2Fsettings');
  await expect(page).toHaveURL(/\/settings$/);
  // ...and the choices are the ones Settings shows.
  await page.goto('/settings/language');
  await expect(page.getByLabel(/Tamil/)).toBeChecked();
  await expect(page.getByLabel('English')).toBeChecked();
  await expect(page.getByLabel('Region')).toHaveValue('IN-TN');
});

test('Skip saves nothing chosen, and the step is not asked again', async ({ page }) => {
  const email = uniqueEmail('onboard-skip');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);

  await page.goto('/onboarding');
  await page.getByLabel(/Hindi/).check(); // ticked, but Skip means skip
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/localhost:3000\/$/); // no next given: Home

  expect(profile(userId, 'cardinality(language_codes)')).toBe('0');
  expect(profile(userId, 'region_code is null')).toBe('t');
  expect(profile(userId, 'onboarded_at is not null')).toBe('t');
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/localhost:3000\/$/);
});

test('an account that already existed is never sent through it, and the next address cannot lead off the site', async ({ page }) => {
  const email = uniqueEmail('onboard-old');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  sql(`update public.profiles set onboarded_at = created_at where id = '${userId}'`); // what migration 0019 did for every account that existed

  await page.goto('/onboarding?next=%2Fsettings');
  await expect(page).toHaveURL(/\/settings$/);

  // An outside address in ?next= is ignored, so the page cannot be used to bounce someone elsewhere.
  await page.goto('/onboarding?next=https%3A%2F%2Fexample.org%2F');
  await expect(page).toHaveURL(/localhost:3000\/$/);
  await page.goto('/onboarding?next=%2F%2Fexample.org');
  await expect(page).toHaveURL(/localhost:3000\/$/);
});

test('a visitor who is not signed in is sent to login, not shown the step', async ({ page }) => {
  await page.goto('/onboarding');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Skip for now' }), 'the first-step form is not shown').toHaveCount(0);
});

test('a person can mark themselves as done and set their choices, but the same request cannot make them an admin', async ({ request }) => {
  const user = await createApiUser(request, 'onboard-role');
  const patch = (data: Record<string, unknown>) =>
    request.patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.userId}`, { headers: { ...apiHeaders(user.token), Prefer: 'return=representation' }, data });

  const sneaky = await patch({ onboarded_at: new Date().toISOString(), role: 'admin' });
  expect(sneaky.ok(), 'the role cannot be changed from the site').toBeFalsy();
  expect(profile(user.userId, 'role')).toBe('user');
  expect(profile(user.userId, 'onboarded_at is null')).toBe('t'); // all or nothing

  const honest = await patch({ onboarded_at: new Date().toISOString(), language_codes: ['ta'], region_code: 'IN' });
  expect(honest.ok(), 'the first-step update is allowed').toBeTruthy();
  expect(profile(user.userId, `onboarded_at is not null and language_codes = '{ta}' and region_code = 'IN' and role = 'user'`)).toBe('t');
});
