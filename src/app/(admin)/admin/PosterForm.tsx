'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminPoster, Option, RequestOption } from '@/lib/admin-types';
import { explainAdminError } from '@/lib/admin-text';
import { MATCH_MODES, POSTER_KINDS, POSTER_STATUSES, REQUEST_KINDS, isoToIstInput, istInputToIso, paiseToRupees, requestAllowsApproval, requestStatusLabel, validatePoster, type MatchMode, type PosterKind, type PosterStatus } from '@/lib/ledger';
import { createClient } from '@/lib/supabase/client';
import { displayImageUrl } from '@/lib/image-url';
import { extractYoutubeId, youtubeWatchUrl } from '@/lib/youtube';
import CheckGroup from './CheckGroup';

type Status = { ok: boolean; text: string } | null;

function requestLabel(r: RequestOption): string {
  const kind = REQUEST_KINDS.find((k) => k.value === r.kind)?.label.split(' (')[0] ?? r.kind;
  return `${r.contact} · ${kind} · ${requestStatusLabel(r.status)} · ${paiseToRupees(r.amount_paise)}`;
}

/** A Home poster. Shown to users only while it is Approved and inside its dates (India time); approval needs a verified, recorded request. */
export default function PosterForm({ poster, requests, languages, regions, initialRequestId }: {
  poster: AdminPoster | null;
  requests: RequestOption[];
  languages: Option[];
  regions: Option[];
  initialRequestId: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(poster?.title ?? '');
  const [kind, setKind] = useState<PosterKind>(poster?.kind ?? 'event');
  const [image, setImage] = useState(poster?.image_url ?? '');
  const [youtube, setYoutube] = useState(poster?.youtube_id ? youtubeWatchUrl(poster.youtube_id) : '');
  const [match, setMatch] = useState<MatchMode>(poster?.match_mode ?? 'everyone');
  const [langs, setLangs] = useState<string[]>(poster?.target_language_codes ?? []);
  const [regs, setRegs] = useState<string[]>(poster?.target_region_codes ?? []);
  const [eventDate, setEventDate] = useState(poster?.event_date ?? '');
  const [starts, setStarts] = useState(isoToIstInput(poster?.starts_at));
  const [ends, setEnds] = useState(isoToIstInput(poster?.ends_at));
  const [status, setStatusValue] = useState<PosterStatus>(poster?.status ?? 'draft');
  const [requestId, setRequestId] = useState(poster?.request_id ?? initialRequestId);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Status>(null);

  const linked = requests.find((r) => r.id === requestId) ?? null;
  const readiness = requestAllowsApproval(linked);
  const modeHint = MATCH_MODES.find((m) => m.value === match)?.hint ?? '';
  const imageOk = /^https:\/\/[^\s]+$/.test(image.trim());

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const yt = youtube.trim() === '' ? '' : extractYoutubeId(youtube);
    if (yt === null) return setMsg({ ok: false, text: 'That is not a YouTube link. Paste the address of the video.' });
    const problem = validatePoster(
      { status, title, image_url: image, youtube: yt, match_mode: match, languages: langs, regions: regs, event_date: eventDate, starts_local: starts, ends_local: ends, request_id: requestId },
      linked,
    );
    if (problem) return setMsg({ ok: false, text: problem });
    const everyone = match === 'everyone';
    const row = {
      kind,
      title: title.trim(),
      image_url: image.trim(),
      youtube_id: yt === '' ? null : yt,
      target_language_codes: everyone ? [] : langs,
      target_region_codes: everyone ? [] : regs,
      match_mode: match,
      event_date: eventDate || null,
      starts_at: istInputToIso(starts),
      ends_at: istInputToIso(ends),
      status,
      request_id: requestId || null,
    };
    setBusy(true);
    const supabase = createClient();
    if (!poster) {
      const { data, error } = await supabase.from('posters').insert(row).select('id').single();
      setBusy(false);
      if (error || !data) return setMsg({ ok: false, text: explainAdminError(error ?? {}) });
      router.push(`/admin/posters/${data.id}`);
      router.refresh();
      return;
    }
    const { error } = await supabase.from('posters').update(row).eq('id', poster.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    setMsg({ ok: true, text: 'Saved.' });
    router.refresh();
  }

  const shown = imageOk ? displayImageUrl(image, 1000) ?? image.trim() : null;

  return (
    <div className="adm-cols">
    <div className="adm-main-col">
    <section className="section" aria-labelledby="poster-details">
    <h2 id="poster-details">Poster</h2>
    <form onSubmit={submit} className="card adm-form">
      <div className="field">
        <label htmlFor="poster-title">Title</label>
        <input id="poster-title" className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="poster-kind">Kind</label>
        <select id="poster-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as PosterKind)}>
          {POSTER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="poster-image">Image link</label>
        <input id="poster-image" className="input" inputMode="url" value={image} onChange={(e) => setImage(e.target.value)} placeholder="https://" />
        <span className="small muted">A secure (https) address of the poster image. A Google Drive share link works if &ldquo;anyone with the link&rdquo; can view the file.</span>
      </div>
      <div className="field">
        <label htmlFor="poster-youtube">YouTube link (optional)</label>
        <input id="poster-youtube" className="input" inputMode="url" value={youtube} onChange={(e) => setYoutube(e.target.value)} />
      </div>

      <div className="field">
        <label htmlFor="poster-match">Who sees it</label>
        <select id="poster-match" className="input" value={match} onChange={(e) => setMatch(e.target.value as MatchMode)}>
          {MATCH_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <span className="small muted">{modeHint}</span>
      </div>
      {match !== 'everyone' ? (
        <>
          <CheckGroup legend="Target languages" options={languages} selected={langs} onChange={setLangs} />
          <CheckGroup legend="Target regions" options={regions} selected={regs} onChange={setRegs} />
        </>
      ) : null}

      <div className="field">
        <label htmlFor="poster-event-date">Event date (optional)</label>
        <input id="poster-event-date" className="input" type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        <span className="small muted">The poster also stops at the end of this day, India time, even if its paid period runs longer.</span>
      </div>
      <div className="field">
        <label htmlFor="poster-starts">Shown from (India time)</label>
        <input id="poster-starts" className="input" type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="poster-ends">Shown until (India time)</label>
        <input id="poster-ends" className="input" type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
        <span className="small muted">Users never see these dates. The poster simply stops appearing.</span>
      </div>

      <div className="field">
        <label htmlFor="poster-request">Request it belongs to</label>
        <select id="poster-request" className="input" value={requestId} onChange={(e) => setRequestId(e.target.value)}>
          <option value="">None</option>
          {requests.map((r) => <option key={r.id} value={r.id}>{requestLabel(r)}</option>)}
        </select>
        <span className="small muted" role="note">
          {readiness.ok ? 'This request is verified and has an amount: the poster can be approved.' : `Cannot be approved yet: ${readiness.reason}`}
        </span>
      </div>
      <div className="field">
        <label htmlFor="poster-status">Status</label>
        <select id="poster-status" className="input" value={status} onChange={(e) => setStatusValue(e.target.value as PosterStatus)}>
          {POSTER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{poster ? 'Save poster' : 'Create poster'}</button>
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
    </form>
    </section>
    </div>
    <div className="adm-side-col">
      <section className="section" aria-labelledby="poster-preview">
        <h2 id="poster-preview">How it looks on Home</h2>
        <div className="poster-preview">
          <div className="poster-preview-title">Home</div>
          <div className="poster-preview-slide">
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shown} alt={`Preview of ${title || 'the poster'}`} />
            ) : (
              <span>Add an image link to see the poster here.</span>
            )}
          </div>
          <div className="poster-preview-dots" aria-hidden="true">
            <span className="poster-dot poster-dot-on" />
            <span className="poster-dot" />
            <span className="poster-dot" />
          </div>
          <div className="poster-preview-bar" aria-hidden="true" />
        </div>
        <p className="small muted" style={{ margin: '16px 0 0' }}>
          The picture is cropped to the Home slide. Tapping it opens the YouTube link, when there is one.
        </p>
      </section>
    </div>
    </div>
  );
}
