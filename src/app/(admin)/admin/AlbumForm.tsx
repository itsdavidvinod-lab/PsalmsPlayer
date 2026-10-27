'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminAlbum } from '@/lib/admin-types';
import { explainAdminError, isHttpsUrl, isValidSlug, parseOptionalInt, slugify } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

/** Add an album to an artist (album = null) or edit one. */
export default function AlbumForm({ artistId, album }: { artistId: string; album: AdminAlbum | null }) {
  const router = useRouter();
  const idp = `album-${album?.id ?? 'new'}`;
  const [title, setTitle] = useState(album?.title ?? '');
  const [slug, setSlug] = useState(album?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(album !== null);
  const [kind, setKind] = useState<AdminAlbum['kind']>(album?.kind ?? 'album');
  const [year, setYear] = useState(album?.release_year?.toString() ?? '');
  const [cover, setCover] = useState(album?.cover_url ?? '');
  const [published, setPublished] = useState(album?.is_published ?? false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const cleanSlug = slug.trim();
    if (title.trim() === '') return setStatus({ ok: false, text: 'The title is required.' });
    if (!isValidSlug(cleanSlug)) return setStatus({ ok: false, text: 'The address needs lowercase letters, numbers and single hyphens.' });
    const y = parseOptionalInt(year, 1900, 2100);
    if (!y.ok) return setStatus({ ok: false, text: 'The year must be a number between 1900 and 2100, or empty.' });
    if (cover.trim() !== '' && !isHttpsUrl(cover)) return setStatus({ ok: false, text: 'The cover link must be a secure address starting with https://.' });

    const row = { title: title.trim(), slug: cleanSlug, kind, release_year: y.value, cover_url: cover.trim() || null, is_published: published };
    setBusy(true);
    const supabase = createClient();
    const { error } = album
      ? await supabase.from('albums').update(row).eq('id', album.id)
      : await supabase.from('albums').insert({ ...row, artist_id: artistId });
    setBusy(false);
    if (error) return setStatus({ ok: false, text: explainAdminError(error) });
    if (!album) {
      setTitle('');
      setSlug('');
      setSlugTouched(false);
      setYear('');
      setCover('');
      setPublished(false);
    }
    setStatus({ ok: true, text: album ? 'Saved.' : 'Album added.' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="adm-form" style={{ marginTop: 12 }}>
      <div className="field">
        <label htmlFor={`${idp}-title`}>Album title</label>
        <input
          id={`${idp}-title`}
          className="input"
          required
          maxLength={120}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (!slugTouched) setSlug(slugify(e.target.value));
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-slug`}>Album address (slug)</label>
        <input
          id={`${idp}-slug`}
          className="input"
          required
          maxLength={80}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
        />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-kind`}>Type</label>
        <select id={`${idp}-kind`} className="input" value={kind} onChange={(e) => setKind(e.target.value as AdminAlbum['kind'])}>
          <option value="album">Album</option>
          <option value="ep">EP</option>
          <option value="single">Single</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-year`}>Release year</label>
        <input id={`${idp}-year`} className="input" inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-cover`}>Cover link (https)</label>
        <input id={`${idp}-cover`} className="input" inputMode="url" maxLength={500} value={cover} onChange={(e) => setCover(e.target.value)} />
        <span className="small muted">A Google Drive share link works if &ldquo;anyone with the link&rdquo; can view the file.</span>
      </div>
      <div className="field">
        <label className="check" htmlFor={`${idp}-published`} style={{ width: 'fit-content' }}>
          <input id={`${idp}-published`} type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span>Album published</span>
        </label>
      </div>
      {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>{album ? 'Save album' : 'Add album'}</button>
    </form>
  );
}
