import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import Link from 'next/link';
import { BrandMark } from '@/components/Header';
import WelcomeSlides from '@/components/WelcomeSlides';
import { APP_NAME } from '@/lib/brand';
import { WELCOME_COOKIE, shouldShowWelcome } from '@/lib/native-app';
import { safeNextPath } from '@/lib/share';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; deleted?: string }> }) {
  const { next, error, deleted } = await searchParams;
  // The Android app opens on a few welcome slides the first time, then this page. A browser never sees them.
  const welcome = shouldShowWelcome((await headers()).get('user-agent'), (await cookies()).get(WELCOME_COOKIE)?.value);
  return (
    <main className="signin">
      {welcome ? <WelcomeSlides /> : null}
      <div className="signin-card">
        <BrandMark />
        <LoginForm next={safeNextPath(next)} callbackFailed={error === 'callback'} deleted={deleted === '1'} />
        <p className="signin-legal">
          By continuing, you agree to our <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </div>
      <p className="signin-foot">
        <Link href="/about">About {APP_NAME}</Link>
      </p>
    </main>
  );
}
