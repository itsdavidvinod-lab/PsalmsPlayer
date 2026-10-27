// Admin requests ledger and posters: money in rupees stored as paise, India-time windows, approval needing a verified and recorded request,
// and a refund switching the poster off. Runs on the real Supabase stack; everything made here is deleted at the end.
import { expect, test } from '@playwright/test';
import { signInAsAdmin, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  sql(`delete from public.posters where title like 'E2E %'`);
  sql(`delete from public.requests where contact like 'e2e-ledger-%'`);
});

const stamp = Date.now();
const contact = `e2e-ledger-${stamp}@example.test`;
const istLocal = (shift: string) => sql(`select to_char((now() at time zone 'Asia/Kolkata') + interval '${shift}', 'YYYY-MM-DD"T"HH24:MI')`);
const showing = (title: string, languages = '{}') => sql(`select count(*) from public.home_posters('${languages}', null, 12) where title = '${title}'`);

let requestId = '';
let posterId = '';

test('a request is recorded with money in rupees (stored as paise), checked, and verified', async ({ page }) => {
  const { userId } = await signInAsAdmin(page);
  const today = sql('select public.app_today()::text');

  await page.goto('/admin/requests/new');
  await page.locator('#req-channel').selectOption('email');
  await page.locator('#req-contact').fill('not an email');
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'does not look like an email address' })).toBeVisible();

  await page.locator('#req-contact').fill(contact);
  await page.locator('#req-status').selectOption('paid');
  await page.locator('#req-amount').fill('1,500.5');
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'needs the date it was paid' })).toBeVisible();
  await page.locator('#req-paid-on').fill(today);
  await page.locator('#req-amount').fill('abc');
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'amount is not a valid number of rupees' })).toBeVisible();
  expect(sql(`select count(*) from public.requests where contact = '${contact}'`)).toBe('0');

  await page.locator('#req-amount').fill('1,500.5');
  await page.getByRole('button', { name: 'Create request' }).click();
  await expect(page).toHaveURL(/\/admin\/requests\/[0-9a-f-]{36}$/);
  requestId = page.url().split('/').pop() ?? '';
  expect(sql(`select amount_paise || '|' || status || '|' || contact_verified::text || '|' || (paid_at at time zone 'Asia/Kolkata')::date::text from public.requests where id = '${requestId}'`)).toBe(`150050|paid|false|${today}`);
  expect(sql(`select count(*) from public.audit_log where entity = 'requests' and entity_id = '${requestId}' and action = 'INSERT' and actor = '${userId}'`)).toBe('1');
  await expect(page.locator('#req-amount')).toHaveValue('1500.50');

  // Verify the contact.
  await page.locator('#req-verified').check();
  await page.getByRole('button', { name: 'Save request' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select contact_verified::text from public.requests where id = '${requestId}'`)).toBe('true');

  // The list shows it with the amount, which only admins can see.
  await page.goto('/admin/requests');
  const row = page.getByRole('row').filter({ hasText: contact });
  await expect(row).toContainText('Verified');
  await expect(row).toContainText('₹1,500.50');
  await expect(row).toContainText('Paid');
});

test('a poster needs its request verified and recorded, follows its India-time window, and stops when the request is refunded', async ({ page }) => {
  await signInAsAdmin(page);
  const title = `E2E Poster ${stamp}`;

  await page.goto(`/admin/requests/${requestId}`);
  await page.getByRole('link', { name: 'Add a poster' }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/posters/new\\?request=${requestId}$`));
  await expect(page.locator('#poster-request')).toHaveValue(requestId);
  await expect(page.getByText('This request is verified and has an amount: the poster can be approved.')).toBeVisible();

  await page.locator('#poster-title').fill(title);
  await page.locator('#poster-image').fill('http://example.org/e2e.jpg');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'must start with https://' })).toBeVisible();
  await page.locator('#poster-image').fill('https://example.org/e2e.jpg');
  await page.locator('#poster-status').selectOption('approved');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'needs a start and an end' })).toBeVisible();
  expect(sql(`select count(*) from public.posters where title = '${title}'`)).toBe('0');

  // Window in India time, read back from the database in India time.
  const from = istLocal('- 1 hour');
  const until = istLocal('+ 2 days');
  await page.locator('#poster-starts').fill(from);
  await page.locator('#poster-ends').fill(until);
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page).toHaveURL(/\/admin\/posters\/[0-9a-f-]{36}$/);
  posterId = page.url().split('/').pop() ?? '';
  expect(sql(`select to_char(starts_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI') || '|' || to_char(ends_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI') from public.posters where id = '${posterId}'`)).toBe(`${from}|${until}`);
  const banner = page.getByRole('status', { name: 'Poster status' });
  await expect(banner).toContainText('Showing on Home now.');
  expect(showing(title)).toBe('1');

  // Targeting: "everyone" clears the targets; a language-only audience reaches only those users.
  await page.locator('#poster-match').selectOption('both');
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'at least one language and at least one region' })).toBeVisible();
  await page.locator('#poster-match').selectOption('either');
  await page.getByRole('group', { name: 'Target languages' }).getByLabel(/Tamil/).check();
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select match_mode || '|' || array_to_string(target_language_codes, ',') from public.posters where id = '${posterId}'`)).toBe('either|ta');
  expect(showing(title, '{ta}')).toBe('1');
  expect(showing(title, '{hi}')).toBe('0');
  await page.locator('#poster-match').selectOption('everyone');
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select match_mode || '|' || cardinality(target_language_codes) from public.posters where id = '${posterId}'`)).toBe('everyone|0');
  expect(showing(title, '{hi}')).toBe('1');

  // An event date in the past ends the poster at once, whatever its paid period, and the page says so (the same rule as the database).
  await page.locator('#poster-event-date').fill(sql('select (public.app_today() - 1)::text'));
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(banner).toContainText('Its dates have passed.');
  expect(showing(title)).toBe('0');
  await page.locator('#poster-event-date').fill('');
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(banner).toContainText('Showing on Home now.');
  expect(showing(title)).toBe('1');

  // Pausing hides it.
  await page.locator('#poster-status').selectOption('paused');
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(banner).toContainText('Not showing: it is not Approved.');
  expect(showing(title)).toBe('0');
  await page.locator('#poster-status').selectOption('approved');
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(banner).toContainText('Showing on Home now.');
  expect(showing(title)).toBe('1');

  // The poster list says what each poster is doing.
  await page.goto('/admin/posters');
  await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Showing now');

  // A refund switches the poster off in the same save, and it cannot be approved again under that request.
  await page.goto(`/admin/requests/${requestId}`);
  await page.locator('#req-status').selectOption('refunded');
  await page.locator('#req-refund').fill('1500.50');
  await page.locator('#req-refund-reason').fill('Event cancelled');
  await page.getByRole('button', { name: 'Save request' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Any live poster of this request has been switched off.' })).toBeVisible();
  expect(sql(`select status from public.posters where id = '${posterId}'`)).toBe('refunded');
  expect(sql(`select refund_paise || '|' || refund_reason from public.requests where id = '${requestId}'`)).toBe('150050|Event cancelled');
  expect(showing(title)).toBe('0');

  await page.goto(`/admin/posters/${posterId}`);
  await expect(page.getByRole('status', { name: 'Poster status' })).toContainText('Not showing');
  await page.locator('#poster-status').selectOption('approved');
  await page.getByRole('button', { name: 'Save poster' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'is not refunded or cancelled' })).toBeVisible();
  expect(sql(`select status from public.posters where id = '${posterId}'`)).toBe('refunded');
});

test('a refund cannot be larger than the payment, and an unverified request cannot back an approved poster', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto(`/admin/requests/${requestId}`);
  await page.locator('#req-refund').fill('1500.51');
  await page.getByRole('button', { name: 'Save request' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'more than the amount paid' })).toBeVisible();
  expect(sql(`select refund_paise from public.requests where id = '${requestId}'`)).toBe('150050');

  const other = sql(`insert into public.requests (kind, channel, contact) values ('promotion', 'email', 'e2e-ledger-b-${stamp}@example.test') returning id`).split('\n')[0];
  await page.goto(`/admin/posters/new?request=${other}`);
  await expect(page.getByText('Cannot be approved yet: The request’s contact is not verified yet.')).toBeVisible();
  await page.locator('#poster-title').fill(`E2E Unverified ${stamp}`);
  await page.locator('#poster-image').fill('https://example.org/e2e2.jpg');
  await page.locator('#poster-starts').fill(istLocal('- 1 hour'));
  await page.locator('#poster-ends').fill(istLocal('+ 1 day'));
  await page.locator('#poster-status').selectOption('approved');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not verified yet' })).toBeVisible();
  expect(sql(`select count(*) from public.posters where title = 'E2E Unverified ${stamp}'`)).toBe('0');

  // As a draft it is fine: nothing is shown, and nothing was promised.
  await page.locator('#poster-status').selectOption('draft');
  await page.getByRole('button', { name: 'Create poster' }).click();
  await expect(page).toHaveURL(/\/admin\/posters\/[0-9a-f-]{36}$/);
  expect(sql(`select status from public.posters where title = 'E2E Unverified ${stamp}'`)).toBe('draft');
});
