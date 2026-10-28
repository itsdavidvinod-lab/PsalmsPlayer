'use client';

import { useRef, useState } from 'react';
import Cover from '@/components/Cover';
import { PICTURE_BUCKET, PICTURE_MAX_WIDTH, PICTURE_STORED_MAX_BYTES, PICTURE_TYPES, checkPictureFile, pictureObjectName, type PictureKind } from '@/lib/picture-upload';
import { createClient } from '@/lib/supabase/client';
import ImageLinkHelp from './ImageLinkHelp';
import { shrinkPicture } from './shrink-picture';

type Msg = { ok: boolean; text: string } | null;

/** A picture-link field with a "Choose picture" button. The picture is shrunk in the browser, uploaded to the public pictures
 *  bucket and its address is put in the field (press the form's Save to keep it). Pasting a link still works.
 *  `id` is the id of the text field, `what` names the picture in the help text. */
export default function PictureField({ id, label, kind, what, value, onChange, preview = true, hint }: {
  id: string;
  label: string;
  kind: PictureKind;
  what: string;
  value: string;
  onChange: (value: string) => void;
  preview?: boolean;
  hint?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg(null);
    const check = checkPictureFile(file);
    if (!check.ok) return setMsg({ ok: false, text: check.text });
    setBusy(true);
    try {
      let blob: Blob;
      try {
        blob = await shrinkPicture(file, PICTURE_MAX_WIDTH[kind]);
      } catch {
        return setMsg({ ok: false, text: 'That file could not be read as a picture.' });
      }
      if (blob.size > PICTURE_STORED_MAX_BYTES) return setMsg({ ok: false, text: 'The picture is still larger than 2 MB after shrinking. Choose a simpler one.' });
      const supabase = createClient();
      const path = pictureObjectName(kind, crypto.randomUUID(), blob.type);
      const up = await supabase.storage.from(PICTURE_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
      if (up.error) return setMsg({ ok: false, text: `The upload failed: ${up.error.message}` });
      onChange(supabase.storage.from(PICTURE_BUCKET).getPublicUrl(path).data.publicUrl);
      setMsg({ ok: true, text: 'Uploaded. Press Save to keep it.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field pic-field">
      <label htmlFor={id}>{label}</label>
      <div className="pic-row">
        {preview ? <Cover url={value.trim() || null} name={label} size={56} round={kind === 'artist'} /> : null}
        <div className="pic-controls">
          <input id={id} className="input" inputMode="url" maxLength={500} value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://" />
          <div className="pic-actions">
            <button type="button" className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
              {busy ? 'Uploading…' : 'Choose picture'}
            </button>
            {value.trim() !== '' ? (
              <button type="button" className="btn btn-ghost" onClick={() => { onChange(''); setMsg(null); }} disabled={busy}>
                Remove picture
              </button>
            ) : null}
            <input ref={fileRef} type="file" className="pic-file" accept={PICTURE_TYPES.join(',')} onChange={pick} aria-label={`${label}: choose a picture file`} tabIndex={-1} />
          </div>
        </div>
      </div>
      {msg ? <p className={msg.ok ? 'ok small' : 'error small'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      {hint ? <span className="small muted">{hint}</span> : null}
      <ImageLinkHelp what={what} />
    </div>
  );
}
