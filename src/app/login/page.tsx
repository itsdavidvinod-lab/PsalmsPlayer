import type { Metadata } from 'next';
import { BrandMark } from '@/components/Header';
import { APP_NAME } from '@/lib/brand';
import { safeNextPath } from '@/lib/share';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <main className="auth">
      <div className="brand">
        <BrandMark />
        <span>{APP_NAME}</span>
      </div>
      <LoginForm next={safeNextPath(next)} callbackFailed={error === 'callback'} />
    </main>
  );
}
