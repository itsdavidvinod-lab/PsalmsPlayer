import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { loadSongChoices } from '@/lib/admin-data';
import type { AdminAudio, AdminCredit, AdminLyrics, AdminSong } from '@/lib/admin-types';
import { audioHostingState, indiaToday, type AgreementTerms } from '@/lib/audio-file';
import { isUuid, visibilityHint, visibilityLabel } from '@/lib/admin-text';
import AudioSection from '../../AudioSection';
import CreditsSection from '../../CreditsSection';
import LyricsEditor from '../../LyricsEditor';
import SongForm from '../../SongForm';
import YoutubeSection from '../../YoutubeSection';

export const metadata: Metadata = { title: 'Song · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireAdmin(`/admin/songs/${id}`);

  const [songRes, visRes, creditsRes, lyricsRes, audioRes, choices] = await Promise.all([
    supabase
      .from('songs')
      .select('id, artist_id, album_id, slug, title, language_code, musical_key, tempo_bpm, track_no, genres, occasions, moods, youtube_id, youtube_status, youtube_checked_at, is_published, hidden_by_admin, hidden_note, published_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.rpc('admin_song_visibility', { p_song: id }),
    supabase.from('song_credits').select('id, song_id, person_name, role, contact, consent_status, consent_ref, consent_expires_on').eq('song_id', id).order('created_at'),
    supabase.from('lyrics').select('id, version, language_code, body').eq('song_id', id),
    supabase.from('songs').select('audio_path, audio_mime, audio_bytes, duration_s').eq('id', id).maybeSingle(),
    loadSongChoices(supabase),
  ]);
  if (!songRes.data) notFound();

  const song = songRes.data as AdminSong;
  const visibility = typeof visRes.data === 'string' ? visRes.data : null;
  const credits = (creditsRes.data ?? []) as AdminCredit[];
  const lyrics = (lyricsRes.data ?? []) as AdminLyrics[];
  const audio = (audioRes.data ?? { audio_path: null, audio_mime: null, audio_bytes: null, duration_s: null }) as AdminAudio;
  const agreementsRes = await supabase.from('agreements').select('status, starts_on, expires_on, allow_audio_hosting').eq('artist_id', song.artist_id);
  const hosting = audioHostingState((agreementsRes.data ?? []) as AgreementTerms[], indiaToday(new Date()));
  const artistName = choices.artists.find((a) => a.id === song.artist_id)?.name ?? 'Artist';
  const failed = Boolean(visRes.error || creditsRes.error || lyricsRes.error || audioRes.error || agreementsRes.error || choices.failed);
  const live = visibility === 'live';

  return (
    <div>
      <p className="small" style={{ margin: '16px 0 0' }}>
        <Link href="/admin/songs" className="inline">Songs</Link>
        {' · '}
        <Link href={`/admin/artists/${song.artist_id}`} className="inline">{artistName}</Link>
      </p>
      <h1 style={{ fontSize: '1.6rem', margin: '4px 0 12px' }}>{song.title}</h1>
      {failed ? <p className="error" role="alert">Some parts of this page could not be loaded. Please refresh.</p> : null}

      <div className={live ? 'ok' : 'notice'} role="status" aria-label="Song status">
        <strong>{live ? 'Live: users can find this song.' : `Not live: ${visibilityLabel(visibility)}.`}</strong>
        {!live && visibilityHint(visibility) ? <span> {visibilityHint(visibility)}</span> : null}
        {live ? (
          <span>
            {' '}
            <Link href={`/song/${song.slug}`} className="inline">Open it on the site</Link>
          </span>
        ) : null}
      </div>

      <section className="section" aria-labelledby="details">
        <h2 id="details">Details</h2>
        <SongForm
          song={song}
          initialArtistId={song.artist_id}
          artists={choices.artists}
          albums={choices.albums}
          languages={choices.languages}
          genres={choices.genres}
          occasions={choices.occasions}
          moods={choices.moods}
        />
      </section>

      <section className="section" aria-labelledby="credits">
        <h2 id="credits">Credits and consent</h2>
        <CreditsSection songId={song.id} credits={credits} />
      </section>

      <section className="section" aria-labelledby="lyrics">
        <h2 id="lyrics">Lyrics</h2>
        <LyricsEditor songId={song.id} songLanguage={song.language_code} rows={lyrics} languages={choices.languages} />
      </section>

      <section className="section" aria-labelledby="recording">
        <h2 id="recording">Recording</h2>
        <AudioSection songId={song.id} audio={audio} hosting={hosting} />
      </section>

      <section className="section" aria-labelledby="youtube">
        <h2 id="youtube">YouTube link</h2>
        <YoutubeSection songId={song.id} youtubeId={song.youtube_id} status={song.youtube_status} />
      </section>
    </div>
  );
}
