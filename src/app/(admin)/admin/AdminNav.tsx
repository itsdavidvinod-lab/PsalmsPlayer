'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminIcon, type AdminIconName } from './AdminIcons';

const LINKS: { href: string; label: string; icon: AdminIconName }[] = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/artists', label: 'Artists', icon: 'artists' },
  { href: '/admin/songs', label: 'Songs', icon: 'songs' },
  { href: '/admin/requests', label: 'Requests', icon: 'requests' },
  { href: '/admin/posters', label: 'Posters', icon: 'posters' },
  { href: '/admin/lists', label: 'Lists', icon: 'lists' },
];

export default function AdminNav() {
  const path = usePathname() ?? '/admin';
  const active = (href: string) => (href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`));
  return (
    <nav className="admin-nav" aria-label="Admin">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={active(l.href) ? 'page' : undefined}>
          <AdminIcon name={l.icon} />
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
