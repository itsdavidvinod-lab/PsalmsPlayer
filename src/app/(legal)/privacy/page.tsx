import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/brand';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Privacy' };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p className="muted">Last updated 27 October 2026.</p>
      <p>
        This page says what {APP_NAME} keeps about you, why, who can see it and how to have it removed. {APP_NAME} has no advertising and does not
        sell or rent your information.
      </p>

      <h2>What we keep</h2>
      <ul>
        <li><strong>Your Google sign-in details.</strong> Your name and email address, which Google gives us when you sign in. We never see your Google password.</li>
        <li><strong>Your choices.</strong> The languages and region you pick in Settings, the songs you like, the playlists and setlists you make, and the artists you follow.</li>
        <li><strong>What you listen to.</strong> The song and the number of seconds you actually listened, and which songs you opened lyrics for. This is how we count an artist&apos;s monthly listeners and which songs are trending.</li>
        <li><strong>A sign-in cookie.</strong> It keeps you signed in. We do not use advertising or tracking cookies.</li>
      </ul>

      <h2>Who can see it</h2>
      <ul>
        <li>Your likes, playlists, setlists and followed artists are private to you.</li>
        <li>People who run {APP_NAME} (administrators) can see account records and listening records, only to run the service and check that counts are honest.</li>
        <li>Other people see only totals, such as an artist&apos;s monthly listeners and a song&apos;s like count. They never see your name, email or listening history.</li>
      </ul>

      <h2>Who looks after the data</h2>
      <ul>
        <li>Supabase stores the database and the audio files (in India, Mumbai).</li>
        <li>Vercel serves the website.</li>
        <li>Google handles sign-in.</li>
      </ul>
      <p>A link that opens YouTube leaves this site. YouTube then follows its own privacy rules.</p>

      <h2>How long we keep it, and deleting it</h2>
      <p>
        We keep your records while your account exists. To have your account and everything attached to it deleted, ask us
        {CONTACT_EMAIL ? <> by email at <a href={`mailto:${CONTACT_EMAIL}`} className="inline">{CONTACT_EMAIL}</a></> : ' using the contact address of this site'}.
        You can also ask what we hold about you.
      </p>

      <h2>Children</h2>
      <p>{APP_NAME} is not meant for children under 13, and we do not knowingly keep their information.</p>

      <h2>Changes</h2>
      <p>If this page changes in a way that matters, the date at the top changes with it.</p>
      {CONTACT_EMAIL ? (
        <p>
          Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="inline">{CONTACT_EMAIL}</a>
        </p>
      ) : null}
    </>
  );
}
