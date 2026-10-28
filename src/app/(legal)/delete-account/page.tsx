import type { Metadata } from 'next';
import { APP_NAME } from '@/lib/brand';
import { CONTACT_EMAIL } from '@/lib/contact';

export const metadata: Metadata = { title: 'Delete your account' };

export default function DeleteAccountPage() {
  return (
    <>
      <h1>Delete your account</h1>
      <p className="muted">Last updated 28 October 2026.</p>
      <p>You can delete your {APP_NAME} account yourself, in the app or on this website. It takes effect at once.</p>

      <h2>How</h2>
      <ol>
        <li>Open {APP_NAME} and sign in.</li>
        <li>Go to <strong>Settings</strong>, then <strong>Account</strong>.</li>
        <li>Press <strong>Delete account</strong>, then confirm.</li>
      </ol>

      <h2>What is deleted</h2>
      <ul>
        <li>Your sign-in record, with your name, email address and picture.</li>
        <li>Your language and region choices.</li>
        <li>Your liked songs, playlists and setlists, and the artists you follow.</li>
        <li>Your listening history, which is what artists&apos; monthly listener counts are made from. Those counts may go down by one.</li>
      </ul>
      <p>We keep nothing about you after this. Your Google account is not touched.</p>

      <h2>If you cannot sign in</h2>
      <p>
        If you can no longer sign in, write to us
        {CONTACT_EMAIL ? <> at <a href={`mailto:${CONTACT_EMAIL}`} className="inline">{CONTACT_EMAIL}</a></> : ' at the contact address of this site'} from
        the email address of the account and ask for it to be deleted. We will check that the account is yours and delete it.
      </p>
    </>
  );
}
