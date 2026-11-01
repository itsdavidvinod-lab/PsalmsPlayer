'use client';

// The songs saved on this phone, for the screens that show or change them. Inside the Android app only: in a normal browser `enabled`
// stays false, nothing is read and no offline button is shown.
//
// It also keeps the copies honest. When the app opens, comes back to the front after a while, or the connection returns, it asks the
// server which of the saved songs may still be kept and deletes the others (see syncDownloads in lib/offline/manager.ts).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabaseBackend } from '@/lib/offline/backend';
import { offlineStore, offlineSupported } from '@/lib/offline/device';
import { forgetLocalAudio } from '@/lib/offline/local-audio';
import { downloadSong, syncDownloads, usedBytes, type DownloadResult } from '@/lib/offline/manager';
import { dropShell, ensureShell } from '@/lib/offline/shell';
import type { OfflineSongRecord } from '@/lib/offline/store';
import type { Song } from '@/lib/types';

export type OfflineApi = {
  /** Offline use is available here (the Android app). Known right after the first paint. */
  enabled: boolean;
  /** The list of saved songs has been read. */
  ready: boolean;
  /** The saved songs, newest first. */
  records: OfflineSongRecord[];
  /** Space the saved recordings take, in bytes. */
  usedBytes: number;
  isSaved: (songId: string) => boolean;
  /** 0 to 1 while the song is being downloaded, otherwise null. */
  progressOf: (songId: string) => number | null;
  download: (song: Song) => Promise<DownloadResult>;
  remove: (songId: string) => Promise<void>;
  removeAll: () => Promise<void>;
};

const OFFLINE_OFF: OfflineApi = {
  enabled: false,
  ready: false,
  records: [],
  usedBytes: 0,
  isSaved: () => false,
  progressOf: () => null,
  download: async () => ({ kind: 'failed' }),
  remove: async () => {},
  removeAll: async () => {},
};

const OfflineContext = createContext<OfflineApi>(OFFLINE_OFF);

/** The saved songs. Outside the provider (and outside the app) this is a harmless "nothing is saved". */
export function useOffline(): OfflineApi {
  return useContext(OfflineContext);
}

/** A returning visit to the front of the app checks again only after this long. */
const RECHECK_MS = 30 * 60 * 1000;

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [records, setRecords] = useState<OfflineSongRecord[]>([]);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const syncing = useRef<Promise<void> | null>(null);
  const lastCheck = useRef(0);

  const refresh = useCallback(async (): Promise<OfflineSongRecord[]> => {
    try {
      const list = await offlineStore().list();
      setRecords(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  const runSync = useCallback((): Promise<void> => {
    if (syncing.current) return syncing.current;
    const job = (async () => {
      try {
        const summary = await syncDownloads(supabaseBackend(), offlineStore());
        if (summary.ran) lastCheck.current = Date.now();
        forgetLocalAudio([...summary.removed, ...summary.audioDropped, ...summary.audioReplaced]);
        const list = await refresh();
        if (list.length === 0 && summary.removed.length > 0) await dropShell();
      } catch {
        // A check that fails changes nothing; the next one tries again.
      }
    })().finally(() => {
      syncing.current = null;
    });
    syncing.current = job;
    return job;
  }, [refresh]);

  useEffect(() => {
    if (!offlineSupported()) return;
    setEnabled(true);
    let cancelled = false;
    void (async () => {
      const list = await refresh();
      if (cancelled) return;
      setReady(true);
      if (list.length > 0) {
        void ensureShell();
        void runSync();
      }
    })();
    const onOnline = () => void runSync();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheck.current > RECHECK_MS) void runSync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, runSync]);

  const download = useCallback(
    (song: Song): Promise<DownloadResult> => {
      setProgress((p) => ({ ...p, [song.id]: 0 }));
      // One download at a time: a recording is held in memory while it arrives.
      const run = queue.current.then(async (): Promise<DownloadResult> => {
        try {
          return await downloadSong(song, supabaseBackend(), offlineStore(), (fraction) => setProgress((p) => ({ ...p, [song.id]: fraction })));
        } catch {
          return { kind: 'failed' };
        }
      });
      queue.current = run;
      return run.then(async (result) => {
        setProgress((p) => {
          const next = { ...p };
          delete next[song.id];
          return next;
        });
        forgetLocalAudio([song.id]);
        const list = await refresh();
        if (result.kind === 'saved' && list.length > 0) void ensureShell();
        return result;
      });
    },
    [refresh],
  );

  const remove = useCallback(
    async (songId: string) => {
      try {
        await offlineStore().remove(songId);
      } catch {
        // Storage trouble: the list below shows what is really there.
      }
      forgetLocalAudio([songId]);
      const list = await refresh();
      if (list.length === 0) await dropShell();
    },
    [refresh],
  );

  const removeAll = useCallback(async () => {
    try {
      await offlineStore().clear();
    } catch {
      // As above.
    }
    forgetLocalAudio();
    await refresh();
    await dropShell();
  }, [refresh]);

  const saved = useMemo(() => new Set(records.map((r) => r.songId)), [records]);
  const api = useMemo<OfflineApi>(
    () => ({
      enabled,
      ready,
      records,
      usedBytes: usedBytes(records),
      isSaved: (id) => saved.has(id),
      progressOf: (id) => (id in progress ? progress[id] : null),
      download,
      remove,
      removeAll,
    }),
    [enabled, ready, records, saved, progress, download, remove, removeAll],
  );

  return <OfflineContext.Provider value={api}>{children}</OfflineContext.Provider>;
}
