// Contact us: the admin manages the options (WhatsApp, email, phone, link) and Settings > About shows the ones that are switched on as
// buttons. Runs on the real Supabase stack. Everything created here is deleted again.
import { expect, test } from '@playwright/test';
import { ANON_KEY, SUPABASE_URL, apiHeaders, createApiUser, signInAsAdmin, signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  sql(`delete from public.site_contacts`);
});
test.afterAll(() => {
  sql(`delete from public.site_contacts`);
});

const count = () => Number(sql(`select count(*) from public.site_contacts`));

test('with no options set, About has no Contact us section', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('contact-empty'));
  await page.goto('/settings/about');
  await expect(page.getByRole('heading', { name: 'About', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Contact us' })).toHaveCount(0);
});

test('the admin adds a WhatsApp number and an email address, and bad values are refused with a sentence', async ({ page }) => {
  const admin = await signInAsAdmin(page);
  await page.goto('/admin/contact');
  await expect(page.getByRole('heading', { name: 'Contact options', level: 1 })).toBeVisible();
  await expect(page.getByText('No options yet')).toBeVisible();

  await page.getByText('+ Add option').click();
  const kind = page.locator('#contact-new-kind');
  const value = page.locator('#contact-new-value');
  const label = page.locator('#contact-new-label');
  await expect(kind).toHaveValue('whatsapp'); // the most likely one first
  await expect(label).toHaveValue('Chat on WhatsApp'); // with a button text already suggested

  // A number without its country code cannot open a chat, so it is refused rather than saved.
  await value.fill('98765 43210');
  await page.getByRole('button', { name: 'Add option' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'country code' })).toBeVisible();
  expect(count()).toBe(0);

  // A number with its country code is saved as digits only, however it was typed.
  await value.fill('+91 98765 43210');
  await label.fill('E2E Chat with us');
  await page.getByRole('button', { name: 'Add option' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Option added.' })).toBeVisible();
  expect(sql(`select kind || ':' || value from public.site_contacts where label = 'E2E Chat with us'`)).toBe('whatsapp:919876543210');
  // Every change to the options is recorded with who made it.
  expect(sql(`select count(*) from public.audit_log where entity = 'site_contacts' and action = 'INSERT' and actor = '${admin.userId}'`)).toBe('1');

  // A wrong email address is refused.
  await kind.selectOption('email');
  await expect(label).toHaveValue('Email us'); // the suggestion follows the type
  await value.fill('not-an-email');
  await page.getByRole('button', { name: 'Add option' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'does not look like an email address' })).toBeVisible();
  expect(count()).toBe(1);
  await value.fill('help@example.test');
  await label.fill('E2E Mail us');
  await page.getByRole('button', { name: 'Add option' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Option added.' })).toBeVisible();
  expect(sql(`select kind || ':' || value from public.site_contacts where label = 'E2E Mail us'`)).toBe('email:help@example.test');

  await kind.selectOption('whatsapp');
  await value.fill('https://wa.me/447700900123?text=hello');
  await label.fill('E2E Second chat');
  await page.getByRole('button', { name: 'Add option' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Option added.' })).toBeVisible();
  expect(sql(`select value from public.site_contacts where label = 'E2E Second chat'`)).toBe('447700900123');
  sql(`delete from public.site_contacts where label = 'E2E Second chat'`);

  // They are listed, in order, on the admin page.
  await page.reload();
  await expect(page.locator('summary', { hasText: 'E2E Chat with us' })).toBeVisible();
  await expect(page.locator('summary', { hasText: 'E2E Mail us' })).toBeVisible();
});

test('About shows the options as buttons that open WhatsApp and the email app, and leaves out a hidden one', async ({ page }) => {
  sql(`insert into public.site_contacts (kind, label, value, sort_order, is_active) values ('link', 'E2E Hidden link', 'https://example.org/hidden', 9, false)`);
  await signUpAndIn(page, uniqueEmail('contact-about'));
  await page.goto('/settings/about');
  await expect(page.getByRole('heading', { name: 'Contact us' })).toBeVisible();

  const buttons = page.locator('.contact-btn');
  await expect(buttons).toHaveCount(2); // the hidden one is not shown
  await expect(buttons.nth(0)).toContainText('E2E Chat with us');
  await expect(buttons.nth(1)).toContainText('E2E Mail us');

  const chat = page.getByRole('link', { name: /E2E Chat with us/ });
  await expect(chat).toHaveAttribute('href', 'https://wa.me/919876543210');
  await expect(chat).toHaveAttribute('target', '_blank');
  await expect(chat).toHaveAttribute('rel', /noopener/);
  const mail = page.getByRole('link', { name: /E2E Mail us/ });
  await expect(mail).toHaveAttribute('href', 'mailto:help@example.test');
  await expect(mail).not.toHaveAttribute('target', '_blank'); // the phone's own email app
  await expect(page.getByText('E2E Hidden link')).toHaveCount(0);
});

test('the admin edits, hides and deletes an option, and About follows', async ({ page }) => {
  await signInAsAdmin(page);
  const mailId = sql(`select id from public.site_contacts where label = 'E2E Mail us'`);
  const hiddenId = sql(`select id from public.site_contacts where label = 'E2E Hidden link'`);
  await page.goto('/admin/contact');

  // The hidden one says so.
  await expect(page.locator('summary', { hasText: 'E2E Hidden link' }).getByText('Hidden')).toBeVisible();

  // Edit the email address.
  await page.locator('summary', { hasText: 'E2E Mail us' }).click();
  await page.locator(`#contact-${mailId}-value`).fill('support@example.test');
  await page.locator(`details:has(#contact-${mailId}-value)`).getByRole('button', { name: 'Save option' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select value from public.site_contacts where id = '${mailId}'`)).toBe('support@example.test');

  // Show the hidden link, with an address that is not https refused first.
  await page.locator('summary', { hasText: 'E2E Hidden link' }).click();
  const hidden = page.locator(`details:has(#contact-${hiddenId}-value)`);
  await page.locator(`#contact-${hiddenId}-value`).fill('http://example.org/not-secure');
  await hidden.getByRole('button', { name: 'Save option' }).click();
  await expect(hidden.getByRole('alert')).toBeVisible();
  expect(sql(`select value from public.site_contacts where id = '${hiddenId}'`)).toBe('https://example.org/hidden');
  await page.locator(`#contact-${hiddenId}-value`).fill('https://example.org/follow');
  await page.locator(`#contact-${hiddenId}-label`).fill('E2E Follow us');
  await page.locator(`#contact-${hiddenId}-active`).check();
  await hidden.getByRole('button', { name: 'Save option' }).click();
  await expect(hidden.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select is_active::text || ':' || label from public.site_contacts where id = '${hiddenId}'`)).toBe('true:E2E Follow us');

  // About now shows the new address and the link.
  await page.goto('/settings/about');
  await expect(page.getByRole('link', { name: /E2E Mail us/ })).toHaveAttribute('href', 'mailto:support@example.test');
  const follow = page.getByRole('link', { name: /E2E Follow us/ });
  await expect(follow).toHaveAttribute('href', 'https://example.org/follow');
  await expect(follow).toHaveAttribute('target', '_blank');

  // Delete asks twice, then it is gone.
  await page.goto('/admin/contact');
  await page.locator('summary', { hasText: 'E2E Follow us' }).click();
  const card = page.locator(`details:has(#contact-${hiddenId}-value)`);
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await card.getByRole('button', { name: 'Keep it' }).click();
  expect(sql(`select count(*) from public.site_contacts where id = '${hiddenId}'`)).toBe('1');
  await card.getByRole('button', { name: 'Delete', exact: true }).click();
  await card.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page.locator('summary', { hasText: 'E2E Follow us' })).toHaveCount(0);
  expect(sql(`select count(*) from public.site_contacts where id = '${hiddenId}'`)).toBe('0');
});

test('only an admin can read the hidden options or change any of them, and visitors who are not signed in see nothing', async ({ page, request }) => {
  const hiddenRow = sql(
    `insert into public.site_contacts (kind, label, value, sort_order, is_active) values ('phone', 'E2E Secret phone', '+911234567890', 20, false) returning id`,
  ).split('\n')[0];
  const user = await createApiUser(request, 'contact-user');
  const rest = `${SUPABASE_URL}/rest/v1/site_contacts`;

  // A signed-in user reads the visible options only.
  const read = await request.get(`${rest}?select=label`, { headers: apiHeaders(user.token) });
  expect(read.ok()).toBeTruthy();
  const labels = ((await read.json()) as { label: string }[]).map((r) => r.label);
  expect(labels).toContain('E2E Chat with us');
  expect(labels).not.toContain('E2E Secret phone');

  // ...cannot add, change or delete.
  const add = await request.post(rest, { headers: apiHeaders(user.token), data: { kind: 'link', label: 'E2E Nope', value: 'https://example.org/nope' } });
  expect(add.ok(), 'a normal user cannot add an option').toBeFalsy();
  const change = await request.patch(`${rest}?label=eq.E2E%20Chat%20with%20us`, { headers: { ...apiHeaders(user.token), Prefer: 'return=representation' }, data: { value: '910000000000' } });
  expect(change.ok() ? ((await change.json()) as unknown[]).length : 0, 'a normal user changes nothing').toBe(0);
  const del = await request.delete(`${rest}?label=eq.E2E%20Chat%20with%20us`, { headers: { ...apiHeaders(user.token), Prefer: 'return=representation' } });
  expect(del.ok() ? ((await del.json()) as unknown[]).length : 0, 'a normal user deletes nothing').toBe(0);
  expect(sql(`select value from public.site_contacts where label = 'E2E Chat with us'`)).toBe('919876543210');

  // Not signed in: refused outright.
  const anon = await request.get(`${rest}?select=label`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  const anonRows = anon.ok() ? ((await anon.json()) as unknown[]) : [];
  expect(anonRows.length, 'a visitor sees no contact options').toBe(0);

  // An admin sees the hidden one.
  const { userId } = await signInAsAdmin(page);
  expect(userId).toBeTruthy();
  await page.goto('/admin/contact');
  await expect(page.locator('summary', { hasText: 'E2E Secret phone' })).toBeVisible();
  sql(`delete from public.site_contacts where id = '${hiddenRow}'`);
});
