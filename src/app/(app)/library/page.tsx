import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArtistRow } from '@/components/ArtistRow';
import { HeartIcon, ListIcon } from '@/components/icons';
import ProfileLink from '@/components/ProfileLink';
import { songCountLabel } from '@/lib/list';
import { createClient } from '@/lib/supabase/server';
import type { Artist } from '@/lib/types';
import NewListButton from './NewListButton';

export const metadata: Metadata = { title: 'Library' };
export const dynamic = 'force-dynamic';

type ListRow = { id: string; name: string; kind: 'playlist' | 'setlist'; service_date: string | null; playlist_items: { count: number }[] };
type Tab = 'all' | 'lists' | 'artists';

const TABS: { tab: Tab; label: string; href: string }[] = [
  { tab: 'all', label: 'All', href: '/library' },
  { tab: 'lists', label: 'Lists', href: '/library?tab=lists' },
  { tab: 'artists', label: 'Artists', href: '/library?tab=artists' },
];

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = raw === 'lists' || raw === 'artists' ? raw : 'all';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Flibrary');

  const [listsRes, likedRes, followedRes] = await Promise.all([
    supabase.from('playlists').select('id, name, kind, service_date, playlist_items(count)').order('created_at', { ascending: false }),
    supabase.rpc('my_liked_songs').select('id'),
    supabase.rpc('my_followed_artists'),
  ]);
  const failed = Boolean(listsRes.error || likedRes.error || followedRes.error);
  if (failed) console.error('library: load failed', listsRes.error ?? likedRes.error ?? followedRes.error);
  const lists = (listsRes.data ?? []) as unknown as ListRow[];
  const likedCount = Array.isArray(likedRes.data) ? likedRes.data.length : 0;
  const followed = (followedRes.data ?? []) as Artist[];

  return (
    <div>
      <div className="page-head">
        <h1>Your Library</h1>
        <ProfileLink />
      </div>

      <div className="chip-row" role="group" aria-label="Filter">
        {TABS.map((t) => (
          <Link key={t.tab} href={t.href} className="chip" aria-current={tab === t.tab ? 'true' : undefined} replace>
            {t.label}
          </Link>
        ))}
      </div>

      {failed ? <p className="error section" role="alert">Your library could not be loaded. Please refresh in a moment.</p> : null}

      {tab !== 'artists' ? (
        <section className="section" aria-labelledby="h-lists">
          <h2 id="h-lists">Lists</h2>
          <div className="card-list">
            <Link href="/library/liked" className="card-row">
              <span className="card-tile card-tile-liked" aria-hidden="true"><HeartIcon size={18} filled /></span>
              <span className="card-row-text">
                <span className="card-row-title">Liked songs</span>
                <span className="card-row-sub">List · {songCountLabel(likedCount)}</span>
              </span>
            </Link>
            {lists.map((l) => (
              <Link key={l.id} href={`/library/${l.id}`} className="card-row">
                <span className="card-tile" aria-hidden="true"><ListIcon size={18} /></span>
                <span className="card-row-text">
                  <span className="card-row-title">{l.name}</span>
                  <span className="card-row-sub">
                    {l.kind === 'setlist' ? 'Setlist' : 'Playlist'}
                    {l.service_date ? ` · ${l.service_date}` : ''}
                    {` · ${songCountLabel(l.playlist_items[0]?.count ?? 0)}`}
                  </span>
                </span>
              </Link>
            ))}
            <NewListButton userId={user.id} />
          </div>
          {lists.length === 0 ? <p className="muted small list-hint">No lists yet. Make a playlist to listen, or a setlist for a service.</p> : null}
        </section>
      ) : null}

      {tab !== 'lists' ? (
        <section className="section" aria-labelledby="h-following">
          <h2 id="h-following">Following</h2>
          {followed.length > 0 ? (
            <div className="card-list">
              {followed.map((a) => (
                <ArtistRow key={a.id} artist={a} />
              ))}
            </div>
          ) : (
            <div className="card empty">
              <p>You are not following any artist yet.</p>
              <Link href="/search" className="btn btn-primary">Find artists</Link>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
