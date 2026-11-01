'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Avatar from '@/components/Avatar';
import { changeAvatar, removeAvatar } from '@/lib/avatar-client';
import { createClient } from '@/lib/supabase/client';

type Msg = { ok: boolean; text: string } | null;

/** Display name and profile photo. The photo is the one chosen here, otherwise the one from the Google account, otherwise the initial. */
export default function ProfileForm({ userId, displayName, email, avatarUrl, googleUrl }: {
  userId: string;
  displayName: string | null;
  email: string | null;
  /** The photo chosen on this site, if any. */
  avatarUrl: string | null;
  /** The picture on the Google account, if any. */
  googleUrl: string | null;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(displayName ?? '');
  const [own, setOwn] = useState(avatarUrl);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [photoMsg, setPhotoMsg] = useState<Msg>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    // Only display name, languages, region, photo and the first-step mark can be changed by a user; the database rejects anything else (role included).
    const { error } = await createClient().from('profiles').update({ display_name: name.trim() || null }).eq('id', userId);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: 'Could not save. Please try again.' });
    } else {
      setMsg({ ok: true, text: 'Saved.' });
      router.refresh();
    }
  }

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoMsg(null);
    setPhotoBusy(true);
    const outcome = await changeAvatar(userId, file, own);
    setPhotoBusy(false);
    if (!outcome.ok) return setPhotoMsg({ ok: false, text: outcome.text });
    setOwn(outcome.url);
    setPhotoMsg({ ok: true, text: 'Photo changed.' });
    router.refresh();
  }

  async function remove() {
    setPhotoMsg(null);
    setPhotoBusy(true);
    const outcome = await removeAvatar(userId);
    setPhotoBusy(false);
    if (!outcome.ok) return setPhotoMsg({ ok: false, text: outcome.text });
    setOwn(null);
    setPhotoMsg({ ok: true, text: googleUrl ? 'Photo removed. Your Google picture is shown again.' : 'Photo removed.' });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card section">
      <div className="profile-photo">
        <Avatar name={name || email} url={own ?? googleUrl} size={64} />
        <div style={{ minWidth: 0 }}>
          <div className="photo-actions">
            <button type="button" className="btn" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              {photoBusy ? 'Uploading…' : 'Change photo'}
            </button>
            {own ? (
              <button type="button" className="btn btn-ghost" disabled={photoBusy} onClick={() => void remove()}>Remove photo</button>
            ) : null}
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Choose a profile photo" onChange={(e) => void pick(e)} />
          <p className="small muted" style={{ margin: '6px 0 0' }}>
            {own ? 'This is the photo you chose.' : googleUrl ? 'This is the picture from your Google account.' : 'No photo yet, so your initial is shown.'}
          </p>
        </div>
      </div>
      {photoMsg ? <p className={photoMsg.ok ? 'ok' : 'error'} role={photoMsg.ok ? 'status' : 'alert'}>{photoMsg.text}</p> : null}
      <div className="field">
        <label htmlFor="name">Display name</label>
        <input id="name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
    </form>
  );
}
