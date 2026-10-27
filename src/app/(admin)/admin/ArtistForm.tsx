'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminArtist, Option } from '@/lib/admin-types';
import { explainAdminError, isHttpsUrl, isValidSlug, slugify } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';
import CheckGroup from './CheckGroup';

type Status = { ok: boolean; text: string } | null;

/** Create an artist (artist = null) or edit one. Saved straight to the database as the signed-in admin; the database enforces who may. */
export default function ArtistForm({ artist, languages, regions, genres }: {
  artist: AdminArtist | null;
  languages: Option[];
  regions: Option[];
  genres: Option[];
}) {
  const router = useRouter();
  const editing = artist !== null;
  const [name, setName] = useState(artist?.name ?? '');
  const [slug, setSlug] = useState(artist?.slug ?? '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [bio, setBio] = useState(artist?.bio ?? '');
  const [photo, setPhoto] = useState(artist?.photo_url ?? '');
  const [langs, setLangs] = useState<string[]>(artist?.language_codes ?? []);
  const [region, setRegion] = useState(artist?.region_code ?? '');
  const [genreSel, setGenreSel] = useState<string[]>(artist?.genres ?? []);
  const [published, setPublished] = useState(artist?.is_published ?? false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  function changeName(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const cleanSlug = slug.trim();
    if (name.trim() === '') return setStatus({ ok: false, text: 'The name is required.' });
    if (!isValidSlug(cleanSlug)) {
      return setStatus({ ok: false, text: 'The address needs lowercase letters, numbers and single hyphens, for example grace-worship-team.' });
    }
    if (photo.trim() !== '' && !isHttpsUrl(photo)) {
      return setStatus({ ok: false, text: 'The photo link must be a secure address starting with https://.' });
    }
    const row = {
      name: name.trim(),
      slug: cleanSlug,
      bio: bio.trim() || null,
      photo_url: photo.trim() || null,
      language_codes: langs,
      region_code: region || null,
      genres: genreSel,
      is_published: published,
    };
    setBusy(true);
    const supabase = createClient();
    if (artist) {
      const { error } = await supabase.from('artists').update(row).eq('id', artist.id);
      setBusy(false);
      if (error) return setStatus({ ok: false, text: explainAdminError(error) });
      setStatus({ ok: true, text: 'Saved.' });
      router.refresh();
    } else {
      const { data, error } = await supabase.from('artists').insert(row).select('id').single();
      setBusy(false);
      if (error || !data) return setStatus({ ok: false, text: explainAdminError(error ?? {}) });
      router.push(`/admin/artists/${data.id}`);
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label htmlFor="artist-name">Name</label>
        <input id="artist-name" className="input" required maxLength={120} value={name} onChange={(e) => changeName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="artist-slug">Address (slug)</label>
        <input
          id="artist-slug"
          className="input"
          required
          maxLength={80}
          value={slug}
          onChange={(e) => {
            setSlugTouched(true);
            setSlug(e.target.value);
          }}
          aria-describedby="artist-slug-help"
        />
        <span id="artist-slug-help" className="small muted">Part of the web address, so keep it short. Lowercase letters, numbers and hyphens.</span>
      </div>
      <div className="field">
        <label htmlFor="artist-bio">About</label>
        <textarea id="artist-bio" className="input" rows={4} maxLength={2000} value={bio} onChange={(e) => setBio(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="artist-photo">Photo link (https)</label>
        <input id="artist-photo" className="input" inputMode="url" maxLength={500} value={photo} onChange={(e) => setPhoto(e.target.value)} />
        <span className="small muted">A Google Drive share link works if &ldquo;anyone with the link&rdquo; can view the file.</span>
      </div>
      <CheckGroup legend="Languages" options={languages} selected={langs} onChange={setLangs} />
      <div className="field">
        <label htmlFor="artist-region">Region</label>
        <select id="artist-region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Not set</option>
          {regions.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <CheckGroup legend="Genres" options={genres} selected={genreSel} onChange={setGenreSel} />
      <div className="field">
        <label className="check" htmlFor="artist-published" style={{ width: 'fit-content' }}>
          <input id="artist-published" type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
          <span>Published</span>
        </label>
        <span className="small muted">A published artist appears on the site. Their songs show only while a verified agreement is in force.</span>
      </div>
      {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>{editing ? 'Save changes' : 'Create artist'}</button>
    </form>
  );
}
