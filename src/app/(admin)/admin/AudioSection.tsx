'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { AdminAudio } from '@/lib/admin-types';
import { explainAdminError } from '@/lib/admin-text';
import { AUDIO_MAX_BYTES, audioDisplayName, audioObjectName, checkAudioFile, durationSeconds, mmss, sizeLabel } from '@/lib/audio-file';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

/** Asks the browser for the length of the file. Optional: a file the browser cannot read is still uploaded, with no length. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const probe = new Audio();
    let done = false;
    const finish = (value: number | null) => {
      if (done) return;
      done = true;
      probe.removeAttribute('src');
      URL.revokeObjectURL(url);
      resolve(value);
    };
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => finish(durationSeconds(probe.duration));
    probe.onerror = () => finish(null);
    setTimeout(() => finish(null), 6000);
    probe.src = url;
  });
}

/** The song's recording: upload, replace, remove, and a private preview. `hosting` says whether users could play it today. */
export default function AudioSection({ songId, audio, hosting }: { songId: string; audio: AdminAudio; hosting: { ok: boolean; reason: string } }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Status>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const has = audio.audio_path !== null;

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const file = fileInput.current?.files?.[0];
    if (!file) return setMsg({ ok: false, text: 'Choose an MP3 or M4A file first.' });
    const check = checkAudioFile(file);
    if (!check.ok) return setMsg({ ok: false, text: check.reason });

    setBusy(true);
    setPreviewUrl(null);
    const supabase = createClient();
    const newPath = `${songId}/${audioObjectName(file.name, check.ext, Date.now())}`;
    const oldPath = audio.audio_path;
    const length = await readDuration(file);

    // 1. the file, under a name nobody has used before
    const up = await supabase.storage.from('audio').upload(newPath, file, { contentType: check.mime, upsert: false, cacheControl: '3600' });
    if (up.error) {
      setBusy(false);
      return setMsg({ ok: false, text: `The upload failed: ${up.error.message}` });
    }
    // 2. point the song at it. If this fails the new file is removed again, so nothing is left behind.
    const { error } = await supabase
      .from('songs')
      .update({ audio_path: newPath, audio_mime: check.mime, audio_bytes: file.size, duration_s: length })
      .eq('id', songId);
    if (error) {
      await supabase.storage.from('audio').remove([newPath]);
      setBusy(false);
      return setMsg({ ok: false, text: explainAdminError(error) });
    }
    // 3. only now remove the file it replaced
    let leftover = false;
    if (oldPath && oldPath !== newPath) {
      const gone = await supabase.storage.from('audio').remove([oldPath]);
      leftover = Boolean(gone.error);
    }
    if (fileInput.current) fileInput.current.value = '';
    setBusy(false);
    setMsg({
      ok: true,
      text: leftover ? 'Uploaded. The previous file could not be deleted from storage; delete it in the Supabase dashboard.' : oldPath ? 'Replaced.' : 'Uploaded.',
    });
    router.refresh();
  }

  async function remove() {
    if (!audio.audio_path) return;
    setMsg(null);
    setBusy(true);
    const supabase = createClient();
    const path = audio.audio_path;
    const { error } = await supabase.from('songs').update({ audio_path: null, audio_mime: null, audio_bytes: null, duration_s: null }).eq('id', songId);
    if (error) {
      setBusy(false);
      setConfirmRemove(false);
      return setMsg({ ok: false, text: explainAdminError(error) });
    }
    const gone = await supabase.storage.from('audio').remove([path]);
    setBusy(false);
    setConfirmRemove(false);
    setPreviewUrl(null);
    setMsg({ ok: true, text: gone.error ? 'Removed from the song. The file could not be deleted from storage; delete it in the Supabase dashboard.' : 'Removed.' });
    router.refresh();
  }

  async function preview() {
    if (!audio.audio_path) return;
    setMsg(null);
    const signed = await createClient().storage.from('audio').createSignedUrl(audio.audio_path, 600);
    if (signed.error || !signed.data) return setMsg({ ok: false, text: 'Could not open the file for preview.' });
    setPreviewUrl(signed.data.signedUrl);
  }

  return (
    <div className="card">
      {has && audio.audio_path ? (
        <div>
          <p style={{ margin: '0 0 4px' }}>
            <strong>{audioDisplayName(audio.audio_path)}</strong>
          </p>
          <p className="small muted" style={{ margin: '0 0 8px' }}>
            {audio.audio_mime ?? 'unknown type'}
            {audio.audio_bytes ? ` · ${sizeLabel(audio.audio_bytes)}` : ''}
            {audio.duration_s ? ` · ${mmss(audio.duration_s)}` : ' · length unknown'}
          </p>
          <p className={hosting.ok ? 'ok' : 'notice'} role="status" aria-label="Audio status">
            {hosting.ok ? 'Users can play this file whenever the song is live.' : `Users cannot play this file yet: ${hosting.reason}`}
          </p>
          <button type="button" className="btn btn-ghost" onClick={preview} disabled={busy}>Preview (only you)</button>
          {previewUrl ? <audio controls src={previewUrl} style={{ display: 'block', width: '100%', marginTop: 8 }} /> : null}
        </div>
      ) : (
        <p className="muted" style={{ margin: '0 0 8px' }}>No recording yet. This song is lyrics only.</p>
      )}

      <form onSubmit={upload} style={{ marginTop: 16 }}>
        <div className="field">
          <label htmlFor="audio-file">{has ? 'Replace the recording' : 'Upload a recording'}</label>
          <input id="audio-file" ref={fileInput} type="file" accept=".mp3,.m4a,.aac,audio/mpeg,audio/mp4,audio/aac" disabled={busy} />
          <span className="small muted">MP3 or M4A/AAC, up to {Math.round(AUDIO_MAX_BYTES / (1024 * 1024))} MB. Convert other formats first. Keep this page open until it says Uploaded.</span>
        </div>
        <button type="submit" className="btn" disabled={busy}>{busy ? 'Working…' : has ? 'Replace file' : 'Upload file'}</button>
      </form>

      {has ? (
        <div style={{ marginTop: 16 }}>
          {confirmRemove ? (
            <span>
              Remove this recording from the song and delete the file?{' '}
              <button type="button" className="btn" onClick={remove} disabled={busy}>Yes, remove</button>{' '}
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmRemove(false)} disabled={busy}>Keep it</button>
            </span>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmRemove(true)} disabled={busy}>Remove recording</button>
          )}
        </div>
      ) : null}
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</p> : null}
    </div>
  );
}
