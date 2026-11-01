'use client';

// The "⋮" menu of a song, shared by every song row: Share link, Add to list, Stage mode, Watch on YouTube.
// One menu for the whole app, opened with openSongMenu(song). Also owns the small message ("Link copied.") shown above the player.

import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { downloadMessage } from '@/lib/offline/manager';
import { youtubeWatchUrl } from '@/lib/youtube';
import AddToListPanel from './AddToListPanel';
import Cover from './Cover';
import { ChevronLeftIcon, DownloadedIcon, DownloadIcon, ExternalIcon, ListPlusIcon, ShareIcon, StageIcon } from './icons';
import { useOffline } from './offline/OfflineProvider';
import { usePlayer } from './player/PlayerProvider';
import { shareSong } from './share-client';
import Sheet from './Sheet';
import type { Song } from '@/lib/types';

type MenuSong = Song;

export type SongMenuApi = {
  openSongMenu: (song: MenuSong) => void;
  /** A short message at the bottom of the screen, gone after a few seconds. */
  notify: (text: string) => void;
};

const SongMenuContext = createContext<SongMenuApi | null>(null);

export function useSongMenu(): SongMenuApi {
  const value = useContext(SongMenuContext);
  if (!value) throw new Error('useSongMenu must be used inside SongMenuProvider');
  return value;
}

/** What is inside a song's menu: its title, an optional block of extra rows (the song page puts the lyrics options there),
 *  then Share link, Add to list, Stage mode and Watch on YouTube. Used inside a Sheet. */
export function SongMenuBody({
  song, userId, onClose, notify, before,
}: { song: MenuSong; userId: string | null; onClose: () => void; notify: (text: string) => void; before?: React.ReactNode }) {
  const player = usePlayer();
  const offline = useOffline();
  const [view, setView] = useState<'menu' | 'add'>('menu');
  const saved = offline.isSaved(song.id);
  const downloading = offline.progressOf(song.id);

  async function share() {
    const outcome = await shareSong(song);
    onClose();
    if (outcome.kind === 'copied') notify('Link copied.');
    else if (outcome.kind === 'link') notify(`Copy this link: ${outcome.url}`);
  }

  async function startDownload() {
    onClose();
    notify(`Downloading ${song.title}…`);
    notify(downloadMessage(await offline.download(song), song.title));
  }

  async function removeDownload() {
    onClose();
    await offline.remove(song.id);
    notify(`Removed from downloads: ${song.title}.`);
  }

  return (
    <>
      <div className="sheet-head">
        <Cover url={song.cover_url ?? null} name={song.title} size={44} />
        <div className="sheet-head-text">
          <div className="sheet-title">{song.title}</div>
          <div className="sheet-sub">{song.artist_name}</div>
        </div>
      </div>
      {view === 'menu' ? (
        <>
          {before}
          <ul className="plain-list sheet-list">
            <li>
              <button type="button" className="sheet-item" onClick={() => void share()}>
                <ShareIcon /> <span>Share link</span>
              </button>
            </li>
            {userId ? (
              <li>
                <button type="button" className="sheet-item" onClick={() => setView('add')}>
                  <ListPlusIcon /> <span>Add to list</span>
                </button>
              </li>
            ) : null}
            {offline.enabled && (saved || downloading !== null || song.can_download) ? (
              <li>
                {saved ? (
                  <button type="button" className="sheet-item" onClick={() => void removeDownload()}>
                    <span className="sheet-item-saved"><DownloadedIcon /></span> <span>Downloaded · Remove download</span>
                  </button>
                ) : downloading !== null ? (
                  <button type="button" className="sheet-item" disabled>
                    <DownloadIcon /> <span>Downloading… {Math.round(downloading * 100)}%</span>
                  </button>
                ) : (
                  <button type="button" className="sheet-item" onClick={() => void startDownload()}>
                    <DownloadIcon /> <span>Download for offline</span>
                  </button>
                )}
              </li>
            ) : null}
            <li>
              <Link href={`/stage/song/${song.slug}`} className="sheet-item" onClick={onClose}>
                <StageIcon /> <span>Stage mode</span>
              </Link>
            </li>
            {song.youtube_id ? (
              <li>
                <a
                  href={youtubeWatchUrl(song.youtube_id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sheet-item"
                  onClick={() => {
                    player.pause();
                    onClose();
                  }}
                >
                  <ExternalIcon size={22} /> <span>Watch on YouTube</span>
                </a>
              </li>
            ) : null}
          </ul>
        </>
      ) : userId ? (
        <div className="sheet-body">
          <button type="button" className="sheet-back" onClick={() => setView('menu')}>
            <ChevronLeftIcon size={20} /> <span>Back</span>
          </button>
          <AddToListPanel songId={song.id} userId={userId} />
        </div>
      ) : null}
    </>
  );
}

export function SongMenuProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [song, setSong] = useState<MenuSong | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const notify = useCallback((text: string) => {
    setMessage(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(null), text.length > 40 ? 8000 : 3000);
  }, []);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const api = useMemo<SongMenuApi>(() => ({ openSongMenu: setSong, notify }), [notify]);

  return (
    <SongMenuContext.Provider value={api}>
      {children}
      {song ? (
        <Sheet label={`Options for ${song.title}`} onClose={() => setSong(null)}>
          <SongMenuBody song={song} userId={userId} onClose={() => setSong(null)} notify={notify} />
        </Sheet>
      ) : null}
      {message ? <div className="toast" role="status">{message}</div> : null}
    </SongMenuContext.Provider>
  );
}
