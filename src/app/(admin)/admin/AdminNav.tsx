'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/artists', label: 'Artists' },
  { href: '/admin/songs', label: 'Songs' },
  { href: '/admin/requests', label: 'Requests' },
  { href: '/admin/posters', label: 'Posters' },
  { href: '/admin/lists', label: 'Lists' },
];

export default function AdminNav() {
  const path = usePathname() ?? '/admin';
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="admin-nav" aria-label="Admin">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
