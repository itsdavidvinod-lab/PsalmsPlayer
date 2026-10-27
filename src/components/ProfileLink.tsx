'use client';

import Link from 'next/link';
import Avatar from './Avatar';
import { useShellUser } from './AppShell';

/** The round picture at the right of a page header. It opens Settings. */
export default function ProfileLink() {
  const user = useShellUser();
  return (
    <Link href="/settings" className="avatar-link" aria-label="Profile">
      <Avatar name={user?.name ?? user?.email ?? null} url={user?.avatarUrl ?? null} size={32} />
    </Link>
  );
}
