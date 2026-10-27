import Link from 'next/link';
import { BrandMark } from '@/components/Header';
import { APP_NAME } from '@/lib/brand';

// Public pages (no login): what the app is, the privacy page and the terms. Google asks for these links on its sign-in screen.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="legal">
      <div className="brand">
        <BrandMark />
        <span>{APP_NAME}</span>
      </div>
      <main>{children}</main>
      <nav className="legal-foot" aria-label="About this site">
        <Link href="/about">About</Link>
        <Link href="/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/login">Sign in</Link>
      </nav>
    </div>
  );
}
