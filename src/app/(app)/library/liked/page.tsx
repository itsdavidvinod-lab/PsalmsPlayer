import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeftIcon } from '@/components/icons';
import SongList from '@/components/SongRow';
import { createClient } from '@/lib/supabase/server';
import type { Song } from '@/lib/types';

export const metadata: Metadata = { title: 'Liked songs' };
export const dynamic = 'force-dynamic';

export default async function LikedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Flibrary%2Fliked');

  const res = await supabase.rpc('my_liked_songs');
  if (res.error) console.error('liked: load failed', res.error);
  const songs = (res.data ?? []) as Song[];

  return (
    <div>
      <Link href="/library" className="page-back">
        <ChevronLeftIcon size={18} /> Library
      </Link>
      <h1>Liked songs</h1>
      <p className="small muted" style={{ margin: '2px 0 0' }}>{songs.length} {songs.length === 1 ? 'song' : 'songs'}</p>
      {res.error ? <p className="error section" role="alert">Your liked songs could not be loaded. Please refresh in a moment.</p> : null}
      <section className="section" aria-label="Liked songs">
        {songs.length > 0 ? <SongList songs={songs} source="Liked songs" /> : <div className="card empty">Songs you like appear here.</div>}
      </section>
    </div>
  );
}
