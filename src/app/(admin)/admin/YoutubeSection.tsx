'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { YoutubeStatus } from '@/lib/admin-types';
import { explainAdminError, youtubeStatusLabel } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';
import { extractYoutubeId, youtubeWatchUrl } from '@/lib/youtube';

type Status = { ok: boolean; text: string } | null;
const STATUSES: YoutubeStatus[] = ['unchecked', 'ok', 'channel_mismatch', 'not_embeddable', 'missing'];

/** The song's YouTube link. The site only links out to it, so "checked" means: the link opens the right video on the artist's channel. */
export default function YoutubeSection({ songId, youtubeId, status: savedStatus }: { songId: string; youtubeId: string | null; status: YoutubeStatus }) {
  const router = useRouter();
  const [link, setLink] = useState(youtubeId ? youtubeWatchUrl(youtubeId) : '');
  const [statusSel, setStatusSel] = useState<YoutubeStatus>(savedStatus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Status>(null);

  async function saveLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const text = link.trim();
    const id = text === '' ? null : extractYoutubeId(text);
    if (text !== '' && id === null) {
      return setMsg({ ok: false, text: 'That is not a YouTube link. Paste the address of the video, for example https://www.youtube.com/watch?v=… or https://youtu.be/…' });
    }
    setBusy(true);
    // A new or removed link always starts again from "not checked": the check belongs to one video.
    const { error } = await createClient()
      .from('songs')
      .update({ youtube_id: id, youtube_status: 'unchecked', youtube_checked_at: null })
      .eq('id', songId);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    setStatusSel('unchecked');
    setLink(id ? youtubeWatchUrl(id) : '');
    setMsg({ ok: true, text: id ? 'Link saved. Open it, check it, then set the status below.' : 'Link removed.' });
    router.refresh();
  }

  async function saveStatus(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const { error } = await createClient()
      .from('songs')
      .update({ youtube_status: statusSel, youtube_checked_at: statusSel === 'unchecked' ? null : new Date().toISOString() })
      .eq('id', songId);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    setMsg({ ok: true, text: 'Status saved.' });
    router.refresh();
  }

  return (
    <div className="card">
      <form onSubmit={saveLink}>
        <div className="field">
          <label htmlFor="yt-link">YouTube link</label>
          <input id="yt-link" className="input" inputMode="url" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} />
          <span className="small muted">Any form of the address works: watch, youtu.be, shorts, embed. Leave empty to remove.</span>
        </div>
        <button type="submit" className="btn" disabled={busy}>Save link</button>
        {youtubeId ? (
          <a className="btn btn-ghost" href={youtubeWatchUrl(youtubeId)} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 8 }}>
            Open on YouTube to check
          </a>
        ) : null}
      </form>

      <form onSubmit={saveStatus} style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="yt-status">Check result</label>
          <select id="yt-status" className="input" value={statusSel} disabled={!youtubeId} onChange={(e) => setStatusSel(e.target.value as YoutubeStatus)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{youtubeStatusLabel(s)}</option>
            ))}
          </select>
          <span className="small muted">Users get the link only when the result is OK or Cannot be embedded. The site never plays YouTube inside its pages; it opens the YouTube app.</span>
        </div>
        <button type="submit" className="btn" disabled={busy || !youtubeId}>Save result</button>
      </form>
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</p> : null}
    </div>
  );
}
