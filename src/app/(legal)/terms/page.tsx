import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/brand';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Terms' };

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p className="muted">Last updated 27 October 2026.</p>
      <p>By signing in to {APP_NAME} you agree to these terms.</p>

      <h2>Using the site</h2>
      <ul>
        <li>Use {APP_NAME} for your own worship, practice and services.</li>
        <li>Songs, lyrics, chords and recordings belong to their writers and owners and are shown with their permission. Do not copy them out of the site, sell them or share them publicly.</li>
        <li>Do not try to inflate listening time or like counts, run scripts against the site, or look for ways around its limits.</li>
        <li>Do not try to reach another person&apos;s account or the admin pages.</li>
      </ul>

      <h2>Songs can disappear</h2>
      <p>A song or recording can be removed at any time, for example when permission ends. Lists that held it keep an empty place for it.</p>

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
