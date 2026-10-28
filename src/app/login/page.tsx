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
    <main className="signin">
      <div className="signin-card">
        <BrandMark />
        <LoginForm next={safeNextPath(next)} callbackFailed={error === 'callback'} deleted={deleted === '1'} />
        <p className="signin-legal">
          By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
      <p className="signin-foot">
        <Link href="/about">About {APP_NAME}</Link> · <Link href="/delete-account">Delete account</Link>
      </p>
    </main>
  );
}
