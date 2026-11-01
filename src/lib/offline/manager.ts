// Saving songs on the phone, and keeping them honest.
//
// Two rules decide everything here:
//   1. A copy is made only after the server says this account may keep it (offline_allowed_songs, migration 0017).
//   2. A copy is deleted only after the server says it may NOT be kept any more. A failed request, a dropped connection or a server
//      error is never an answer: it changes nothing. (Otherwise a phone going through a tunnel would wipe the person's downloads.)
//
// The server and the storage are passed in, so the same code runs in the app, in a browser test and in unit tests.

import type { LyricsVersion, Song } from '../types.ts';
import type { OfflineSongRecord, OfflineStoreLike } from './store.ts';

/** Most recordings are a few megabytes; the audio bucket itself stops at 100 MB. */
export const OFFLINE_AUDIO_MAX_BYTES = 150 * 1024 * 1024;

/** How often the lyrics of a saved song are fetched again while the phone is online, so a change to chords or translations arrives. */
export const LYRICS_REFRESH_MS = 6 * 60 * 60 * 1000;

/** The rights check is asked in groups of this many songs (the server accepts 500). */
export const CHECK_GROUP = 200;

export type AudioOutcome = { blob: Blob } | { error: 'failed' | 'no-space' };

export interface OfflineBackend {
  /** Who is signed in, as the server confirms it. Null when nobody is or the server could not be asked. */
  currentUserId(): Promise<string | null>;
  /** Of these songs, the ones this account may keep, each with the path of its recording (null: lyrics only). Null when the server could not be asked. */
  allowed(songIds: string[]): Promise<Map<string, string | null> | null>;
  /** The lyrics this account may read (an empty list when none). Null when the server could not be asked. */
  lyrics(songId: string): Promise<LyricsVersion[] | null>;
  /** The current details of these songs. Null when the server could not be asked. */
  songs(songIds: string[]): Promise<Song[] | null>;
  /** Fetches the recording. `onProgress` gets a number from 0 to 1. */
  audio(path: string, onProgress?: (fraction: number) => void): Promise<AudioOutcome>;
}

export type DownloadResult =
  | { kind: 'saved'; withAudio: boolean; withLyrics: boolean }
  | { kind: 'not-allowed' }
  | { kind: 'nothing' }
  | { kind: 'no-space' }
  | { kind: 'failed' };

function isQuotaError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'QuotaExceededError';
}

export function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The song as it is kept: `has_audio` tells the truth about THIS phone (a recording is saved or not). */
function keptSong(song: Song, hasAudio: boolean): Song {
  return { ...song, has_audio: hasAudio };
}

/** Saves a song: its lyrics and, when the agreement allows it, its recording. Nothing is kept unless everything was fetched. */
export async function downloadSong(
  song: Song,
  backend: OfflineBackend,
  store: OfflineStoreLike,
  onProgress?: (fraction: number) => void,
  now: () => number = () => Date.now(),
): Promise<DownloadResult> {
  const userId = await backend.currentUserId();
  if (!userId) return { kind: 'failed' };

  const answer = await backend.allowed([song.id]);
  if (!answer) return { kind: 'failed' };
  if (!answer.has(song.id)) return { kind: 'not-allowed' };
  const audioPath = answer.get(song.id) ?? null;

  const lyrics = await backend.lyrics(song.id);
  if (!lyrics) return { kind: 'failed' };

  let blob: Blob | null = null;
  if (audioPath) {
    const got = await backend.audio(audioPath, onProgress);
    if ('error' in got) return { kind: got.error };
    blob = got.blob;
  }
  if (!blob && lyrics.length === 0) return { kind: 'nothing' };

  try {
    // Copies belong to one account. If the phone still holds another account's, they go before this one is kept.
    const owner = await store.owner();
    if (owner && owner !== userId) await store.clear();
    await store.setOwner(userId);

    const t = now();
    const record: OfflineSongRecord = {
      songId: song.id,
      song: keptSong(song, blob !== null),
      lyrics,
      audioPath: blob ? audioPath : null,
      audioBytes: blob ? blob.size : 0,
      audioType: blob ? blob.type : '',
      savedAt: t,
      lyricsCheckedAt: t,
    };
    await store.put(record, blob, 'create');
  } catch (e) {
    return { kind: isQuotaError(e) ? 'no-space' : 'failed' };
  }
  return { kind: 'saved', withAudio: blob !== null, withLyrics: lyrics.length > 0 };
}

export type SyncSummary = {
  /** False when nothing could be checked (offline, signed out, server trouble). Nothing was changed. */
  ran: boolean;
  /** Songs whose copies were deleted because they may not be kept any more. */
  removed: string[];
  /** Songs that lost only their recording. */
  audioDropped: string[];
  /** Songs whose recording was replaced on the server and fetched again. */
  audioReplaced: string[];
  /** Everything was deleted because the phone held another account's copies. */
  wiped: boolean;
};

/**
 * Checks the saved songs against the server and brings them up to date. Safe to run at any time and any number of times.
 * Deletes a copy only on a clear "no" from the server, never on a failure.
 */
export async function syncDownloads(backend: OfflineBackend, store: OfflineStoreLike, now: () => number = () => Date.now()): Promise<SyncSummary> {
  const summary: SyncSummary = { ran: false, removed: [], audioDropped: [], audioReplaced: [], wiped: false };

  // Nothing saved: nothing to check, and no reason to ask the server anything.
  let records = await store.list();
  if (records.length === 0) {
    summary.ran = true;
    return summary;
  }

  const userId = await backend.currentUserId();
  if (!userId) return summary;

  const owner = await store.owner();
  if (owner && owner !== userId) {
    summary.removed.push(...records.map((r) => r.songId));
    summary.wiped = true;
    await store.clear();
    records = [];
  }
  if (owner !== userId) await store.setOwner(userId);
  if (records.length === 0) {
    summary.ran = true;
    return summary;
  }

  // 1. The rights. One failed group stops the whole check: no answer is not a "no".
  const allowed = new Map<string, string | null>();
  for (const group of chunks(records.map((r) => r.songId), CHECK_GROUP)) {
    const part = await backend.allowed(group);
    if (!part) return summary;
    for (const [id, path] of part) allowed.set(id, path);
  }
  summary.ran = true;

  // 2. The songs' current details (only for songs that may stay). A failure keeps the old details.
  const stay = records.filter((r) => allowed.has(r.songId)).map((r) => r.songId);
  const fresh = new Map<string, Song>();
  for (const group of chunks(stay, CHECK_GROUP)) {
    const rows = await backend.songs(group);
    if (rows) for (const s of rows) fresh.set(s.id, s);
  }

  for (const rec of records) {
    if (!allowed.has(rec.songId)) {
      await store.remove(rec.songId);
      summary.removed.push(rec.songId);
      continue;
    }
    const path = allowed.get(rec.songId) ?? null;
    let audio: Blob | null | undefined;
    let audioPath = rec.audioPath;
    let audioBytes = rec.audioBytes;
    let audioType = rec.audioType;
    let lyrics = rec.lyrics;
    let lyricsCheckedAt = rec.lyricsCheckedAt;

    // The artist no longer allows the recording on phones: it goes, the lyrics stay.
    if (path === null && rec.audioPath !== null) {
      audio = null;
      audioPath = null;
      audioBytes = 0;
      audioType = '';
      summary.audioDropped.push(rec.songId);
    }
    // The recording was replaced on the server: fetch the new file. If that fails the old one stays and the next check tries again.
    if (path !== null && path !== rec.audioPath) {
      const got = await backend.audio(path);
      if ('blob' in got) {
        audio = got.blob;
        audioPath = path;
        audioBytes = got.blob.size;
        audioType = got.blob.type;
        summary.audioReplaced.push(rec.songId);
      }
    }
    if (now() - rec.lyricsCheckedAt >= LYRICS_REFRESH_MS) {
      const fetched = await backend.lyrics(rec.songId);
      if (fetched) {
        lyrics = fetched;
        lyricsCheckedAt = now();
      }
    }

    // Nothing left that may be kept: the song goes.
    if (lyrics.length === 0 && audioPath === null) {
      await store.remove(rec.songId);
      summary.removed.push(rec.songId);
      continue;
    }

    const next: OfflineSongRecord = {
      ...rec,
      song: keptSong(fresh.get(rec.songId) ?? rec.song, audioPath !== null),
      lyrics,
      audioPath,
      audioBytes,
      audioType,
      lyricsCheckedAt,
    };
    try {
      await store.put(next, audio, 'replace');
    } catch {
      // A full disk or a storage error while refreshing: the song keeps what it had.
    }
  }
  return summary;
}

/** The sentence shown after a download attempt. */
export function downloadMessage(result: DownloadResult, title: string): string {
  switch (result.kind) {
    case 'saved':
      if (result.withAudio) return `Saved for offline: ${title}.`;
      return `Lyrics saved for offline: ${title}. This song has no recording to keep.`;
    case 'not-allowed':
      return 'This song cannot be downloaded right now.';
    case 'nothing':
      return 'There is nothing to download for this song.';
    case 'no-space':
      return 'Not enough space on this phone. Free some space and try again.';
    case 'failed':
      return 'The download did not finish. Check your connection and try again.';
  }
}

/** The audio type to give a saved recording: the server's when it is an audio type, otherwise one chosen from the file's ending. */
export function audioMimeFor(path: string, headerType: string | null | undefined): string {
  const header = (headerType ?? '').split(';')[0].trim().toLowerCase();
  if (header.startsWith('audio/')) return header;
  const ext = path.toLowerCase().split('.').pop() ?? '';
  const byExt: Record<string, string> = {
    mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm',
  };
  return byExt[ext] ?? 'audio/mpeg';
}

/** Whether the phone can take `bytes` more, with a margin for the database's own use. Unknown space counts as enough. */
export function hasRoomFor(bytes: number, estimate: { quota?: number; usage?: number } | null | undefined): boolean {
  if (!estimate || typeof estimate.quota !== 'number' || estimate.quota <= 0) return true;
  const free = estimate.quota - (estimate.usage ?? 0);
  return free >= bytes * 1.1 + 20 * 1024 * 1024;
}

/** The space the saved recordings take. */
export function usedBytes(records: Pick<OfflineSongRecord, 'audioBytes'>[]): number {
  return records.reduce((sum, r) => sum + r.audioBytes, 0);
}
