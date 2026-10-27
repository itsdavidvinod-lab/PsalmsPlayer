import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { loadSongChoices } from '@/lib/admin-data';
import { isUuid } from '@/lib/admin-text';
import PageHead from '../../PageHead';
import SongForm from '../../SongForm';

export const metadata: Metadata = { title: 'New song · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewSong({ searchParams }: { searchParams: Promise<{ artist?: string }> }) {
  const { artist } = await searchParams;
  const { supabase } = await requireAdmin('/admin/songs/new');
  const choices = await loadSongChoices(supabase);

  return (
    <div>
      <PageHead title="New song" crumbs={<Link href="/admin/songs" className="inline">Songs</Link>} />
      {choices.failed ? <p className="error adm-banner" role="alert">Some choices could not be loaded. Please refresh.</p> : null}
      <section className="section" aria-labelledby="details" style={{ marginTop: 0 }}>
        <h2 id="details">Details</h2>
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
      </section>
    </div>
  );
}
