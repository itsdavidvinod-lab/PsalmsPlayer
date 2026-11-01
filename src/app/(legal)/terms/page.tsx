import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/brand';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p className="muted">Last updated 2 November 2026.</p>
      <p>By signing in to {APP_NAME} you agree to these terms.</p>

      <h2>Using the site</h2>
      <ul>
        <li>Use {APP_NAME} for your own worship, practice and services.</li>
        <li>Songs, lyrics, chords and recordings belong to their writers and owners and are shown with their permission. Do not copy them out of the site, sell them or share them publicly. The one copy the app makes for you is the download described below.</li>
        <li>Do not try to inflate listening time or like counts, run scripts against the site, or look for ways around its limits.</li>
        <li>Do not try to reach another person&apos;s account or the admin pages.</li>
        <li>A profile photo must be yours to use. Do not choose a picture that is unlawful, hateful or of someone else without their permission. We may remove a photo that breaks this.</li>
      </ul>

      <h2>Downloads in the Android app</h2>
      <ul>
        <li>For songs whose artist has allowed it, the Android app can keep a copy of the recording and the lyrics on your phone, so you can listen and read without a connection.</li>
        <li>A download is for your own listening on that phone. It stays inside the app: do not try to take the files out of it, copy them elsewhere or share them.</li>
        <li>An artist can withdraw permission at any time. A song that may no longer be kept is removed from your phone the next time the app is online.</li>
        <li>Downloads belong to the account that made them and are removed when you sign out or delete your account.</li>
      </ul>

      <h2>Songs can disappear</h2>
      <p>A song or recording can be removed at any time, for example when permission ends. Lists that held it keep an empty place for it, and a downloaded copy is deleted from your phone the next time the app is online.</p>

      <h2>Accounts</h2>
      <p>We may stop an account that breaks these terms. You can ask for your account to be deleted, as the <Link href="/privacy" className="inline">privacy page</Link> explains.</p>

      <h2>No guarantee</h2>
      <p>{APP_NAME} is provided as it is. We try to keep it running and accurate, but we cannot promise it will always be available or free of mistakes.</p>
      {CONTACT_EMAIL ? (
        <p>
          Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="inline">{CONTACT_EMAIL}</a>
        </p>
      ) : null}
    </>
  );
}
