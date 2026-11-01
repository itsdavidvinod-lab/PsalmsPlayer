'use client';

// The download button on a song row: whether to show it, what state it is in, and what starting a download does.
// The ⋮ menu has the same item (SongMenu); both go through the same OfflineProvider, so they always agree.

import { downloadMessage } from '@/lib/offline/manager';
import type { Song } from '@/lib/types';
import { useSongMenu } from '../SongMenu';
import { useOffline } from './OfflineProvider';

export type SongDownload = {
  /** Show the button: inside the Android app, and this song can be downloaded or already is (or is being). */
  visible: boolean;
  saved: boolean;
  /** 0 to 1 while downloading, otherwise null. */
  progress: number | null;
  start: () => Promise<void>;
};

export function useSongDownload(song: Song): SongDownload {
  const offline = useOffline();
  const menu = useSongMenu();
  const saved = offline.isSaved(song.id);
  const progress = offline.progressOf(song.id);
  const visible = offline.enabled && (saved || progress !== null || song.can_download);

  async function start() {
    menu.notify(`Downloading ${song.title}…`);
    menu.notify(downloadMessage(await offline.download(song), song.title));
  }

  return { visible, saved, progress, start };
}
