// The real server behind the offline logic: Supabase, with the signed-in person's own session.

import { createClient } from '@/lib/supabase/client';
import type { LyricsVersion, Song } from '@/lib/types';
import { OFFLINE_AUDIO_MAX_BYTES, audioMimeFor, hasRoomFor, type AudioOutcome, type OfflineBackend } from './manager';

async function storageEstimate(): Promise<{ quota?: number; usage?: number } | null> {
  try {
    return (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}

/** Reads the response body piece by piece, so the progress can be shown, and puts it back together as one file. */
async function readWithProgress(res: Response, total: number, onProgress?: (fraction: number) => void): Promise<Blob | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      parts.push(value);
      received += value.byteLength;
      if (received > OFFLINE_AUDIO_MAX_BYTES) {
        void reader.cancel();
        return null;
      }
      if (total > 0) onProgress?.(Math.min(1, received / total));
    }
  }
  if (total > 0 && received !== total) return null; // cut short: not a whole recording
  return new Blob(parts as BlobPart[], { type: res.headers.get('content-type') ?? '' });
}

export function supabaseBackend(): OfflineBackend {
  const supabase = createClient();
  return {
    async currentUserId() {
      try {
        const { data, error } = await supabase.auth.getUser();
        return error || !data.user ? null : data.user.id;
      } catch {
        return null;
      }
    },

    async allowed(songIds) {
      try {
        const { data, error } = await supabase.rpc('offline_allowed_songs', { p_songs: songIds });
        if (error || !Array.isArray(data)) return null;
        const map = new Map<string, string | null>();
        for (const row of data as { song_id: string; audio_path: string | null }[]) map.set(row.song_id, row.audio_path ?? null);
        return map;
      } catch {
        return null;
      }
    },

    async lyrics(songId) {
      try {
        const { data, error } = await supabase.rpc('get_lyrics', { p_song: songId });
        if (error || !Array.isArray(data)) return null;
        return data as LyricsVersion[];
      } catch {
        return null;
      }
    },

    async songs(songIds) {
      try {
        const { data, error } = await supabase.from('v_songs').select('*').in('id', songIds);
        if (error || !Array.isArray(data)) return null;
        return data as Song[];
      } catch {
        return null;
      }
    },

    async audio(path, onProgress): Promise<AudioOutcome> {
      try {
        const signed = await supabase.storage.from('audio').createSignedUrl(path, 600);
        if (signed.error || !signed.data) return { error: 'failed' };
        const res = await fetch(signed.data.signedUrl);
        if (!res.ok) return { error: 'failed' };
        const total = Number(res.headers.get('content-length')) || 0;
        if (total > OFFLINE_AUDIO_MAX_BYTES) return { error: 'failed' };
        if (total > 0 && !hasRoomFor(total, await storageEstimate())) {
          void res.body?.cancel();
          return { error: 'no-space' };
        }
        const raw = await readWithProgress(res, total, onProgress);
        if (!raw || raw.size === 0) return { error: 'failed' };
        onProgress?.(1);
        return { blob: new Blob([raw], { type: audioMimeFor(path, raw.type) }) };
      } catch {
        return { error: 'failed' };
      }
    },
  };
}
