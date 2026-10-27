'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminSong, AlbumOption, ArtistOption, Option } from '@/lib/admin-types';
import { KEY_CHOICES, explainAdminError, isHttpsUrl, isValidSlug, parseOptionalInt, slugify } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';
import CheckGroup from './CheckGroup';
import ImageLinkHelp from './ImageLinkHelp';

type Status = { ok: boolean; text: string } | null;

/** Create a song (song = null) or edit its details. Lyrics, credits, the YouTube link and audio have their own sections. */
export default function SongForm({ song, initialArtistId, artists, albums, languages, genres, occasions, moods }: {
  song: AdminSong | null;
  initialArtistId: string;
  artists: ArtistOption[];
  albums: AlbumOption[];
  languages: Option[];
  genres: Option[];
  occasions: Option[];
  moods: Option[];
}) {
  const router = useRouter();
  const editing = song !== null;
  const [title, setTitle] = useState(song?.title ?? '');
  const [slug, setSlug] = useState(song?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [artistId, setArtistId] = useState(song?.artist_id ?? initialArtistId);
  const [albumId, setAlbumId] = useState(song?.album_id ?? '');
  const [language, setLanguage] = useState(song?.language_code ?? '');
  const [key, setKey] = useState(song?.musical_key ?? '');
  const [tempo, setTempo] = useState(song?.tempo_bpm?.toString() ?? '');
  const [track, setTrack] = useState(song?.track_no?.toString() ?? '');
  const [cover, setCover] = useState(song?.cover_url ?? '');
  const [genreSel, setGenreSel] = useState<string[]>(song?.genres ?? []);
  const [occasionSel, setOccasionSel] = useState<string[]>(song?.occasions ?? []);
  const [moodSel, setMoodSel] = useState<string[]>(song?.moods ?? []);
  const [published, setPublished] = useState(song?.is_published ?? false);
  const [hidden, setHidden] = useState(song?.hidden_by_admin ?? false);
  const [hiddenNote, setHiddenNote] = useState(song?.hidden_note ?? '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const albumChoices = albums.filter((a) => a.artist_id === artistId);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const cleanSlug = slug.trim();
    if (title.trim() === '') return setStatus({ ok: false, text: 'The title is required.' });
    if (!isValidSlug(cleanSlug)) {
      return setStatus({ ok: false, text: 'The address needs lowercase letters, numbers and single hyphens, for example amazing-grace.' });
    }
    if (artistId === '') return setStatus({ ok: false, text: 'Choose the artist.' });
    if (language === '') return setStatus({ ok: false, text: 'Choose the language of the song.' });
    if (cover.trim() !== '' && !isHttpsUrl(cover.trim())) {
      return setStatus({ ok: false, text: 'The cover link must be a secure address starting with https://.' });
    }
    const bpm = parseOptionalInt(tempo, 30, 300);
    if (!bpm.ok) return setStatus({ ok: false, text: 'The tempo must be a number between 30 and 300, or empty.' });
    const trackNo = parseOptionalInt(track, 1, 999);
    if (!trackNo.ok) return setStatus({ ok: false, text: 'The track number must be a number between 1 and 999, or empty.' });

    const row: Record<string, unknown> = {
      title: title.trim(),
      slug: cleanSlug,
      artist_id: artistId,
      album_id: albumId || null,
      language_code: language,
      musical_key: key || null,
      tempo_bpm: bpm.value,
      track_no: trackNo.value,
      cover_url: cover.trim() || null,
      genres: genreSel,
      occasions: occasionSel,
      moods: moodSel,
      is_published: published,
    };
    // The first time a song is published, remember when.
    if (published && !song?.published_at) row.published_at = new Date().toISOString();
    if (song) {
      row.hidden_by_admin = hidden;
      row.hidden_note = hidden ? hiddenNote.trim() || null : null;
    }

    setBusy(true);
    const supabase = createClient();
    if (song) {
      const { error } = await supabase.from('songs').update(row).eq('id', song.id);
      setBusy(false);
      if (error) return setStatus({ ok: false, text: explainAdminError(error) });
      setStatus({ ok: true, text: 'Saved.' });
      router.refresh();
    } else {
      const { data, error } = await supabase.from('songs').insert(row).select('id').single();
      setBusy(false);
      if (error || !data) return setStatus({ ok: false, text: explainAdminError(error ?? {}) });
      router.push(`/admin/songs/${data.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="card adm-form">
      <div className="field">
        <label htmlFor="song-title">Title</label>
        <input
          id="song-title"
          className="input"
          required
          maxLength={160}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor="song-slug">Address (slug)</label>
        <input
          id="song-slug"
          className="input"
          required
          maxLength={80}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          aria-describedby="song-slug-help"
        />
        <span id="song-slug-help" className="small muted">Unique across all songs. Changing it breaks links people already shared.</span>
      </div>
      <div className="field">
        <label htmlFor="song-artist">Artist</label>
        <select
          id="song-artist"
          className="input"
          value={artistId}
          onChange={(e) => {
            setArtistId(e.target.value);
            setAlbumId(''); // an album belongs to one artist
          }}
        >
          <option value="">Choose the artist</option>
          {artists.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        {editing ? <span className="small muted">Changing the artist changes which agreement and consents apply to this song.</span> : null}
      </div>
      <div className="field">
        <label htmlFor="song-album">Album</label>
        <select id="song-album" className="input" value={albumId} onChange={(e) => setAlbumId(e.target.value)}>
          <option value="">No album (single)</option>
          {albumChoices.map((a) => (
            <option key={a.id} value={a.id}>{a.title}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="song-language">Language</label>
        <select id="song-language" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="">Choose the language</option>
          {languages.map((l) => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="song-key">Key</label>
        <select id="song-key" className="input" value={key} onChange={(e) => setKey(e.target.value)}>
          <option value="">Not set</option>
          {KEY_CHOICES.map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="song-tempo">Tempo (beats per minute)</label>
        <input id="song-tempo" className="input" inputMode="numeric" maxLength={3} value={tempo} onChange={(e) => setTempo(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="song-track">Track number</label>
        <input id="song-track" className="input" inputMode="numeric" maxLength={3} value={track} onChange={(e) => setTrack(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="song-cover">Cover picture link (https)</label>
        <input id="song-cover" className="input" inputMode="url" maxLength={500} value={cover} onChange={(e) => setCover(e.target.value)} placeholder="https://" aria-describedby="song-cover-help" />
        <span id="song-cover-help" className="small muted">Shown next to the song in lists and in the player. Leave empty to use the album&rsquo;s cover; a single with no cover shows a coloured placeholder.</span>
        <ImageLinkHelp what="cover picture" />
      </div>
      <CheckGroup legend="Genres" options={genres} selected={genreSel} onChange={setGenreSel} />
      <CheckGroup legend="Occasions" options={occasions} selected={occasionSel} onChange={setOccasionSel} />
      <CheckGroup legend="Moods" options={moods} selected={moodSel} onChange={setMoodSel} />
      <div className="field">
        <label className="check" htmlFor="song-published" style={{ width: 'fit-content' }}>
          <input id="song-published" type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span>Published</span>
        </label>
        <span className="small muted">A published song still shows only while its artist is published, an agreement is in force and every writer and owner has consented.</span>
      </div>
      {editing ? (
        <fieldset className="field" style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, margin: '0 0 14px' }}>
          <legend>Takedown</legend>
          <label className="check" htmlFor="song-hidden" style={{ width: 'fit-content' }}>
            <input id="song-hidden" type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            <span>Taken down</span>
          </label>
          <span className="small muted">Overrides everything else: the song disappears for users at once, with its lyrics and audio.</span>
          <label htmlFor="song-hidden-note" className="small" style={{ marginTop: 8 }}>Reason (only admins see this)</label>
          <input id="song-hidden-note" className="input" maxLength={300} value={hiddenNote} onChange={(e) => setHiddenNote(e.target.value)} />
        </fieldset>
      ) : null}
      {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>{editing ? 'Save song' : 'Create song'}</button>
    </form>
  );
}
