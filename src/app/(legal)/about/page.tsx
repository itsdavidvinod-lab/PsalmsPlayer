import type { Metadata } from 'next';
import Link from 'next/link';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <>
      <h1>{APP_NAME}</h1>
      <p>
        {APP_NAME} is a songbook and music player for the Christian community. It has lyrics and chords for services and practice, a
        player for songs and recordings, and lists you can build for a service.
      </p>
      <p>
        Songs and recordings appear with the permission of the people who wrote and own them. You sign in with your Google account to
        read lyrics and listen.
      </p>
      <p>
        <Link href="/login" className="btn btn-primary">Sign in with Google</Link>
      </p>
      <p className="small muted">
        Read how we handle your information on the <Link href="/privacy" className="inline">privacy page</Link> and the rules for using the site on the{' '}
        <Link href="/terms" className="inline">terms page</Link>.
      </p>
    </>
  );
}
