import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/Header';
import { APP_NAME } from '@/lib/brand';

export const metadata: Metadata = { title: 'Get the app' };

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Public landing page for "share app link". Store links are added when the apps are published.
export default async function GetPage({ searchParams }: { searchParams: Promise<{ song?: string }> }) {
  const { song } = await searchParams;
  const slug = song && SLUG_RE.test(song) ? song : null;
  const webHref = slug ? `/login?next=${encodeURIComponent('/song/' + slug)}` : '/login';
  return (
    <main className="auth">
      <div className="brand">
        <BrandMark />
        <span>{APP_NAME}</span>
      </div>
      <h1>Get the app</h1>
      <p className="muted">The mobile apps are not published yet. You can open this song on the web now.</p>
      <Link href={webHref} className="btn btn-primary btn-block">
        {slug ? 'Open this song' : 'Open on the web'}
      </Link>
    </main>
  );
}
