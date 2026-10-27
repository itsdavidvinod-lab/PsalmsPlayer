import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { ChevronRightIcon } from '@/components/icons';
import { createClient } from '@/lib/supabase/server';
import { pictureFromMetadata } from '@/lib/user';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

function Row({ href, title, sub }: { href: string; title: string; sub?: string }) {
  return (
    <li>
      <Link href={href} className="menu-row">
        <span className="menu-row-text">
          <span className="menu-row-title">{title}</span>
          {sub ? <span className="menu-row-sub">{sub}</span> : null}
        </span>
        <ChevronRightIcon />
      </Link>
    </li>
  );
}

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings');

  const { data } = await supabase.from('profiles').select('display_name, role').eq('id', user.id).maybeSingle();
  const profile = (data ?? { display_name: null, role: 'user' }) as { display_name: string | null; role: 'user' | 'admin' };
  const shownName = profile.display_name || user.email || 'You';

  return (
    <div>
      <h1>Settings</h1>
      <div className="profile-photo" style={{ marginTop: 14, marginBottom: 0 }}>
        <Avatar name={shownName} url={pictureFromMetadata(user.user_metadata)} size={56} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{shownName}</div>
          {user.email ? <div className="small muted">{user.email}</div> : null}
        </div>
      </div>
      <ul className="menu-list">
        <Row href="/settings/profile" title="Profile" sub="Display name and picture" />
        <Row href="/settings/language" title="Language and region" sub="Shapes what Home shows first" />
        <Row href="/settings/account" title="Account" sub="Sign-in details and sign out" />
        {profile.role === 'admin' ? <Row href="/admin" title="Admin site" sub="Songs, artists, posters and requests" /> : null}
        <Row href="/settings/about" title="About" />
      </ul>
    </div>
  );
}
