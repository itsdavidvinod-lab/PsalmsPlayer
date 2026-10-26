// Admin agreements: adding, verifying (with proof), changing rights, revoking, and what the artist page says about whether users can see the artist.
// Runs on the real Supabase stack. Artists made here are deleted at the end (their agreements go with them).
import { expect, test } from '@playwright/test';
import { signInAsAdmin, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  sql(`delete from public.artists where slug like 'e2e-artist-%'`);
});

function bareArtist(slug: string): string {
  return sql(`insert into public.artists (slug, name, is_published) values ('${slug}', 'E2E Agreement Artist', true) returning id`).split('\n')[0];
}

test('an agreement is verified only with proof, then it turns the artist on; revoking turns it off again', async ({ page }) => {
  const { userId } = await signInAsAdmin(page);
  const id = bareArtist(`e2e-artist-agr-${Date.now()}`);
  const past = sql('select public.app_today() - 10');
  const soon = sql('select public.app_today() + 30');

  await page.goto(`/admin/artists/${id}`);
  const banner = page.getByRole('status', { name: 'Artist status' });
  const section = page.locator('section[aria-labelledby="agreements"]');
  await expect(banner).toContainText('Not available to users: no verified agreement is in force.');
  await expect(section).toContainText('No agreements yet');

  // Add one that has only been sent.
  await section.getByText('Add an agreement').click();
  await section.locator('#agr-new-ref').fill('MSG-100');
  await section.getByRole('button', { name: 'Add agreement' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Agreement added.' })).toBeVisible();
  const aid = sql(`select id from public.agreements where artist_id = '${id}'`);
  const state = () =>
    sql(
      `select status || '|' || coalesce(document_ref, '') || '|' || coalesce((verified_by = '${userId}')::text, 'null') || '|' || (verified_at is not null)::text || '|' || allow_lyrics::text || '|' || allow_chords::text from public.agreements where id = '${aid}'`,
    );
  expect(state()).toBe('sent|MSG-100|null|false|false|false');
  expect(sql(`select count(*) from public.audit_log where entity = 'agreements' and entity_id = '${aid}' and action = 'INSERT' and actor = '${userId}'`)).toBe('1');
  await expect(banner).toContainText('Not available to users: no verified agreement is in force.');

  const card = section.locator('details', { has: page.locator(`#agr-${aid}-status`) });
  await card.locator('summary').click();
  await expect(card.locator('summary')).toContainText('Sent · no term set · Not verified yet');

  // Verifying without dates, without the reference, or with the dates the wrong way round is refused with a sentence, and nothing is saved.
  await card.locator(`#agr-${aid}-status`).selectOption('verified');
  await card.getByRole('button', { name: 'Save agreement' }).click();
  await expect(card.getByRole('alert').filter({ hasText: 'needs both a start date and an end date' })).toBeVisible();
  await card.locator(`#agr-${aid}-ref`).fill('');
  await card.locator(`#agr-${aid}-starts`).fill(past);
  await card.locator(`#agr-${aid}-expires`).fill(soon);
  await card.getByRole('button', { name: 'Save agreement' }).click();
  await expect(card.getByRole('alert').filter({ hasText: 'needs the document reference' })).toBeVisible();
  await card.locator(`#agr-${aid}-ref`).fill('MSG-100');
  await card.locator(`#agr-${aid}-starts`).fill(soon);
  await card.locator(`#agr-${aid}-expires`).fill(past);
  await card.getByRole('button', { name: 'Save agreement' }).click();
  await expect(card.getByRole('alert').filter({ hasText: 'The end date is before the start date.' })).toBeVisible();
  expect(sql(`select status from public.agreements where id = '${aid}'`)).toBe('sent');

  // Now with proof and a lyrics right: the artist becomes available and the database records who verified it.
  await card.locator(`#agr-${aid}-starts`).fill(past);
  await card.locator(`#agr-${aid}-expires`).fill(soon);
  await card.locator(`#agr-${aid}-allow_lyrics`).check();
  await card.getByRole('button', { name: 'Save agreement' }).click();
  await expect(card.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(state()).toBe('verified|MSG-100|true|true|true|false');
  expect(sql(`select count(*) from public.active_agreements where artist_id = '${id}'`)).toBe('1');
  await expect(banner).toContainText(`Available: users can find this artist. The agreement in force ends on ${soon} (30 days left).`);
  await expect(card.locator('summary')).toContainText(`Verified · ${past} to ${soon} · In force`);

  // It shows up on the dashboard's expiry list.
  await page.goto('/admin');
  await expect(page.locator('section[aria-labelledby="expiry"]')).toContainText('E2E Agreement Artist');
  await page.goto(`/admin/artists/${id}`);

  // Revoking asks twice, because every song of the artist disappears at once.
  const card2 = section.locator('details', { has: page.locator(`#agr-${aid}-status`) });
  await card2.locator('summary').click();
  await card2.locator(`#agr-${aid}-status`).selectOption('revoked');
  await card2.getByRole('button', { name: 'Save agreement' }).click();
  await expect(card2).toContainText('Revoke this agreement?');
  expect(sql(`select status from public.agreements where id = '${aid}'`)).toBe('verified');
  await card2.getByRole('button', { name: 'Cancel' }).click();
  await card2.getByRole('button', { name: 'Save agreement' }).click();
  await card2.getByRole('button', { name: 'Yes, revoke' }).click();
  await expect(card2.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(state()).toBe('revoked|MSG-100|true|true|true|false'); // the record of who verified it stays
  expect(sql(`select count(*) from public.active_agreements where artist_id = '${id}'`)).toBe('0');
  await expect(banner).toContainText('Not available to users: no verified agreement is in force.');
  await expect(card2.locator('summary')).toContainText('Revoked');

  // Verified again but already over: not in force, and the page says Expired.
  await card2.locator(`#agr-${aid}-status`).selectOption('verified');
  await card2.locator(`#agr-${aid}-starts`).fill(sql('select public.app_today() - 30'));
  await card2.locator(`#agr-${aid}-expires`).fill(past);
  await card2.getByRole('button', { name: 'Save agreement' }).click();
  await expect(card2.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await expect(card2.locator('summary')).toContainText('Expired');
  await expect(banner).toContainText('Not available to users: no verified agreement is in force.');

  expect(Number(sql(`select count(*) from public.audit_log where entity = 'agreements' and entity_id = '${aid}' and action = 'UPDATE' and actor = '${userId}'`))).toBeGreaterThanOrEqual(3);
});

test('territories and the withdrawal email are checked, and an unpublished artist says so', async ({ page }) => {
  await signInAsAdmin(page);
  const id = bareArtist(`e2e-artist-agr-b-${Date.now()}`);
  sql(`update public.artists set is_published = false where id = '${id}'`);
  await page.goto(`/admin/artists/${id}`);
  await expect(page.getByRole('status', { name: 'Artist status' })).toContainText('Not available to users: the artist is not published and no verified agreement is in force.');

  const section = page.locator('section[aria-labelledby="agreements"]');
  await section.getByText('Add an agreement').click();
  await section.locator('#agr-new-territories').fill('India');
  await section.getByRole('button', { name: 'Add agreement' }).click();
  await expect(section.getByRole('alert').filter({ hasText: '"INDIA" is not a country or region code' })).toBeVisible();
  await section.locator('#agr-new-territories').fill('in, lk');
  await section.locator('#agr-new-email').fill('not an email');
  await section.getByRole('button', { name: 'Add agreement' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'does not look like an email address' })).toBeVisible();
  expect(sql(`select count(*) from public.agreements where artist_id = '${id}'`)).toBe('0');

  await section.locator('#agr-new-email').fill('rights@band.example');
  await section.getByRole('button', { name: 'Add agreement' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Agreement added.' })).toBeVisible();
  expect(sql(`select array_to_string(territories, ',') || '|' || revocation_email from public.agreements where artist_id = '${id}'`)).toBe('IN,LK|rights@band.example');
});
