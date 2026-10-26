'use client';

// The frame around every signed-in page: sidebar on wide screens, tab bar on phones, and the player bar above it.
// It is rendered by the (app) layout, which stays mounted while people move between pages, so the music keeps playing.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { APP_NAME } from '@/lib/brand';
import { BrandMark } from './Header';
import { HomeIcon, LibraryIcon, SearchIcon, SettingsIcon } from './icons';
import MiniPlayer from './player/MiniPlayer';
import { PlayerProvider, usePlayer } from './player/PlayerProvider';

const NAV = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/browse', label: 'Browse', Icon: SearchIcon },
  { href: '/library', label: 'Library', Icon: LibraryIcon },
  { href: '/settings', label: 'Settings', Icon: SettingsIcon },
];

function Frame({ children }: { children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const { current } = usePlayer();
  const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

  const signOut = (
    <form action="/auth/signout" method="post">
      <button type="submit" className="btn btn-ghost">Sign out</button>
    </form>
  );

  return (
    <div className="shell" data-player={current ? 'on' : 'off'}>
      <aside className="side">
        <Link href="/" className="brand">
          <BrandMark />
          <span>{APP_NAME}</span>
        </Link>
        <nav aria-label="Main" className="side-nav">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">{signOut}</div>
      </aside>

      <div className="main-col">
        <header className="topbar">
          <Link href="/" className="brand">
            <BrandMark />
            <span>{APP_NAME}</span>
          </Link>
          {signOut}
        </header>
        <main className="content">{children}</main>
      </div>

      <MiniPlayer />

      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ href, label, Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}>
            <Icon />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <Frame>{children}</Frame>
    </PlayerProvider>
  );
}
