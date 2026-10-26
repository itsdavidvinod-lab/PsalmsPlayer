import Link from 'next/link';
import { APP_NAME } from '@/lib/brand';

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18M7 9h10" />
      </svg>
    </span>
  );
}

export default function Header() {
  return (
    <header className="header">
      <Link href="/" className="brand">
        <BrandMark />
        <span>{APP_NAME}</span>
      </Link>
      <nav className="header-actions" aria-label="Account">
        <Link href="/settings" className="btn btn-ghost">Settings</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className="btn btn-ghost">Sign out</button>
        </form>
      </nav>
    </header>
  );
}
