import type { Metadata } from 'next';
import Link from 'next/link';
import { BrandMark } from '@/components/Header';
import { APP_NAME } from '@/lib/brand';
import { safeNextPath } from '@/lib/share';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const { next, error, deleted } = await searchParams;
  return (
    <main className="auth">
      <div className="brand">
        <BrandMark />
        <span>{APP_NAME}</span>
      </div>
      <LoginForm next={safeNextPath(next)} callbackFailed={error === 'callback'} deleted={deleted === '1'} />
      <p className="small muted" style={{ marginTop: 24 }}>
        <Link href="/about" className="inline">About</Link> · <Link href="/privacy" className="inline">Privacy</Link> · <Link href="/terms" className="inline">Terms</Link> · <Link href="/delete-account" className="inline">Delete account</Link>
      </p>
    </main>
  );
}
