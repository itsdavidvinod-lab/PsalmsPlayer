'use client';

// The frame around every signed-in page: a sidebar on wide screens, a tab bar on phones, and the player strip above it.
// It is rendered by the (app) layout, which stays mounted while people move between pages, so the music keeps playing.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { createContext, useContext } from 'react';
import Avatar from './Avatar';
import { HomeIcon, LibraryIcon, SearchIcon } from './icons';
import { LikesProvider } from './LikesProvider';
import MiniPlayer from './player/MiniPlayer';
import { PlayerProvider, usePlayer } from './player/PlayerProvider';
import { SongMenuProvider } from './SongMenu';

/** Who is signed in, as far as the frame needs to know. */
export type ShellUser = { id: string; name: string | null; email: string | null; avatarUrl: string | null; isAdmin: boolean };

const ShellUserContext = createContext<ShellUser | null>(null);

/** Who is signed in, for any screen inside the frame (the picture in a page header, for instance). */
export function useShellUser(): ShellUser | null {
  return useContext(ShellUserContext);
}

const NAV = [
  { href: '/', label: 'Home', Icon: HomeIcon },
  { href: '/search', label: 'Search', Icon: SearchIcon },
  { href: '/library', label: 'Library', Icon: LibraryIcon },
];

function Frame({ user, children }: { user: ShellUser | null; children: React.ReactNode }) {
  const path = usePathname() ?? '/';
  const { current } = usePlayer();
  const isActive = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  const who = user?.name || user?.email || 'Settings';

  return (
    <div className="shell" data-player={current ? 'on' : 'off'}>
      <aside className="side">
        <nav aria-label="Main" className="side-nav">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? 'page' : undefined}>
              <Icon />
              <span>{label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <Link href="/settings" className="side-me" aria-label="Settings" aria-current={isActive('/settings') ? 'page' : undefined}>
            <Avatar name={user?.name ?? user?.email ?? null} url={user?.avatarUrl ?? null} size={32} />
            <span>{who}</span>
          </Link>
        </div>
      </aside>

      <div className="main-col">
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

export default function AppShell({ user, likedIds, children }: { user: ShellUser | null; likedIds: string[]; children: React.ReactNode }) {
  return (
    <PlayerProvider>
      <LikesProvider userId={user?.id ?? null} initial={likedIds}>
        <SongMenuProvider userId={user?.id ?? null}>
          <ShellUserContext.Provider value={user}>
            <Frame user={user}>{children}</Frame>
          </ShellUserContext.Provider>
        </SongMenuProvider>
      </LikesProvider>
    </PlayerProvider>
  );
}
