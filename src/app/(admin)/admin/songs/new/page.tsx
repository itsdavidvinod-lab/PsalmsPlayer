import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { loadSongChoices } from '@/lib/admin-data';
import { isUuid } from '@/lib/admin-text';
import SongForm from '../../SongForm';

export const metadata: Metadata = { title: 'New song · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewSong({ searchParams }: { searchParams: Promise<{ artist?: string }> }) {
  const { artist } = await searchParams;
  const { supabase } = await requireAdmin('/admin/songs/new');
  const choices = await loadSongChoices(supabase);

  return (
    <div>
      <p className="small" style={{ margin: '16px 0 0' }}><Link href="/admin/songs" className="inline">Songs</Link></p>
      <h1 style={{ fontSize: '1.6rem', margin: '4px 0 12px' }}>New song</h1>
      {choices.failed ? <p className="error" role="alert">Some choices could not be loaded. Please refresh.</p> : null}
      <SongForm
        song={null}
        initialArtistId={artist && isUuid(artist) && choices.artists.some((a) => a.id === artist) ? artist : ''}
        artists={choices.artists}
        albums={choices.albums}
        languages={choices.languages}
        genres={choices.genres}
        occasions={choices.occasions}
        moods={choices.moods}
      />
    </div>
  );
}
