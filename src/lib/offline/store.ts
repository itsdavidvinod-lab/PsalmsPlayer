// Where the Android app keeps songs for offline use: this phone's own browser storage (IndexedDB), never the server.
//
//   songs  one record per saved song: its details and lyrics (small, so the list opens at once)
//   audio  the recording as a Blob, under the song's id (large, only read when the song is played)
//   meta   who the copies belong to, so another account never sees them
//
// A song counts as saved when its record exists. Saving a song writes the record and the recording in ONE transaction, so there
// is never a record without the recording it says it has, nor a recording nobody knows about.

import type { LyricsVersion, Song } from '../types.ts';

export type OfflineSongRecord = {
  songId: string;
  /** The song's details as they were when last seen online (title, artist, key, ...). `has_audio` says whether a recording is saved. */
  song: Song;
  /** The lyrics as the server gave them to this account (chords only when the agreement allows). Empty when there are none to keep. */
  lyrics: LyricsVersion[];
  /** Where the saved recording came from in the audio bucket, to notice when the file is replaced. Null when no recording is saved. */
  audioPath: string | null;
  audioBytes: number;
  audioType: string;
  savedAt: number;
  lyricsCheckedAt: number;
};

/** What the rest of the code needs from the storage. The browser version is `IdbStore`; tests use `MemoryStore`. */
export interface OfflineStoreLike {
  /** Every saved song, newest first. */
  list(): Promise<OfflineSongRecord[]>;
  get(songId: string): Promise<OfflineSongRecord | null>;
  getAudio(songId: string): Promise<Blob | null>;
  /**
   * Writes the record and, in the same step, the recording: a Blob replaces it, `null` removes it, `undefined` leaves it alone.
   * `create` writes whatever is there; `replace` only changes a song that is still saved (so a background check can never bring back
   * a song the person just removed). Resolves to whether anything was written.
   */
  put(record: OfflineSongRecord, audio: Blob | null | undefined, mode: 'create' | 'replace'): Promise<boolean>;
  remove(songId: string): Promise<void>;
  /** Everything, including who the copies belong to. */
  clear(): Promise<void>;
  owner(): Promise<string | null>;
  setOwner(userId: string): Promise<void>;
}

export const DB_NAME = 'psalmsplayer-offline';
const DB_VERSION = 1;
const SONGS = 'songs';
const AUDIO = 'audio';
const META = 'meta';
const OWNER_KEY = 'owner';

function requestResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export class IdbStore implements OfflineStoreLike {
  private readonly factory: IDBFactory;
  private opening: Promise<IDBDatabase> | null = null;

  constructor(factory: IDBFactory) {
    this.factory = factory;
  }

  private db(): Promise<IDBDatabase> {
    if (!this.opening) {
      const opening = new Promise<IDBDatabase>((resolve, reject) => {
        const req = this.factory.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: 'songId' });
          if (!db.objectStoreNames.contains(AUDIO)) db.createObjectStore(AUDIO);
          if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
        };
        req.onsuccess = () => {
          const db = req.result;
          db.onversionchange = () => db.close(); // never hold up a newer version of this database
          db.onclose = () => {
            this.opening = null;
          };
          resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('IndexedDB could not be opened'));
        req.onblocked = () => reject(new Error('IndexedDB is blocked'));
      });
      opening.catch(() => {
        if (this.opening === opening) this.opening = null; // a failed open is tried again next time
      });
      this.opening = opening;
    }
    return this.opening;
  }

  async list(): Promise<OfflineSongRecord[]> {
    const db = await this.db();
    const rows = (await requestResult(db.transaction(SONGS).objectStore(SONGS).getAll())) as OfflineSongRecord[];
    return rows.sort((a, b) => b.savedAt - a.savedAt);
  }

  async get(songId: string): Promise<OfflineSongRecord | null> {
    const db = await this.db();
    const row = (await requestResult(db.transaction(SONGS).objectStore(SONGS).get(songId))) as OfflineSongRecord | undefined;
    return row ?? null;
  }

  async getAudio(songId: string): Promise<Blob | null> {
    const db = await this.db();
    const blob = (await requestResult(db.transaction(AUDIO).objectStore(AUDIO).get(songId))) as Blob | undefined;
    return blob ?? null;
  }

  async put(record: OfflineSongRecord, audio: Blob | null | undefined, mode: 'create' | 'replace'): Promise<boolean> {
    const db = await this.db();
    const tx = db.transaction([SONGS, AUDIO], 'readwrite');
    const finished = transactionDone(tx);
    const songs = tx.objectStore(SONGS);
    const audios = tx.objectStore(AUDIO);
    if (mode === 'replace') {
      const existing = await requestResult(songs.get(record.songId));
      if (!existing) {
        tx.abort();
        await finished.catch(() => {});
        return false;
      }
    }
    songs.put(record);
    if (audio === null) audios.delete(record.songId);
    else if (audio !== undefined) audios.put(audio, record.songId);
    await finished;
    return true;
  }

  async remove(songId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([SONGS, AUDIO], 'readwrite');
    tx.objectStore(SONGS).delete(songId);
    tx.objectStore(AUDIO).delete(songId);
    await transactionDone(tx);
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([SONGS, AUDIO, META], 'readwrite');
    tx.objectStore(SONGS).clear();
    tx.objectStore(AUDIO).clear();
    tx.objectStore(META).clear();
    await transactionDone(tx);
  }

  async owner(): Promise<string | null> {
    const db = await this.db();
    const value = await requestResult(db.transaction(META).objectStore(META).get(OWNER_KEY));
    return typeof value === 'string' ? value : null;
  }

  async setOwner(userId: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(META, 'readwrite');
    tx.objectStore(META).put(userId, OWNER_KEY);
    await transactionDone(tx);
  }
}

/** The same behaviour in memory, for tests that run without a browser. */
export class MemoryStore implements OfflineStoreLike {
  private readonly songs = new Map<string, OfflineSongRecord>();
  private readonly audio = new Map<string, Blob>();
  private ownerId: string | null = null;
  /** Set to make the next write fail the way a full disk does. */
  failNextPut: Error | null = null;

  async list(): Promise<OfflineSongRecord[]> {
    return [...this.songs.values()].sort((a, b) => b.savedAt - a.savedAt);
  }
  async get(songId: string): Promise<OfflineSongRecord | null> {
    return this.songs.get(songId) ?? null;
  }
  async getAudio(songId: string): Promise<Blob | null> {
    return this.audio.get(songId) ?? null;
  }
  async put(record: OfflineSongRecord, audio: Blob | null | undefined, mode: 'create' | 'replace'): Promise<boolean> {
    if (this.failNextPut) {
      const err = this.failNextPut;
      this.failNextPut = null;
      throw err;
    }
    if (mode === 'replace' && !this.songs.has(record.songId)) return false;
    this.songs.set(record.songId, record);
    if (audio === null) this.audio.delete(record.songId);
    else if (audio !== undefined) this.audio.set(record.songId, audio);
    return true;
  }
  async remove(songId: string): Promise<void> {
    this.songs.delete(songId);
    this.audio.delete(songId);
  }
  async clear(): Promise<void> {
    this.songs.clear();
    this.audio.clear();
    this.ownerId = null;
  }
  async owner(): Promise<string | null> {
    return this.ownerId;
  }
  async setOwner(userId: string): Promise<void> {
    this.ownerId = userId;
  }
  /** For assertions: how many recordings are stored, whatever the records say. */
  audioCount(): number {
    return this.audio.size;
  }
}
