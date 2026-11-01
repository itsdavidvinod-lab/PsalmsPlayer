'use client';

import { useEffect, useState } from 'react';
import DownloadRows from '@/components/offline/DownloadRows';
import { useOffline } from '@/components/offline/OfflineProvider';
import { usePlayer } from '@/components/player/PlayerProvider';
import { useRouter } from 'next/navigation';
import { sizeLabel } from '@/lib/audio-file';

/** Settings → Downloads: the songs saved on this phone, how much room they take, and a way to remove them. */
export default function DownloadsManager() {
  const offline = useOffline();
  const player = usePlayer();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  if (!offline.enabled) {
    return <p className="card empty">Downloads are available in the PsalmsPlayer Android app.</p>;
  }

  const playable = offline.records.filter((r) => r.audioPath !== null).map((r) => r.song);
  const count = offline.records.length;

  return (
    <div>
      <p className="small muted" style={{ marginTop: 4 }}>
        {count === 0
          ? 'Nothing is saved on this phone yet.'
          : `${count} ${count === 1 ? 'song' : 'songs'} · ${sizeLabel(offline.usedBytes)} on this phone`}
      </p>
      {count === 0 ? (
        <div className="card empty">
          Open the ⋮ menu of a song and choose <strong>Download for offline</strong>. Saved songs play, and their lyrics open, without a connection.
        </div>
      ) : (
        <>
          <DownloadRows
            records={offline.records}
            playingId={player.current?.id ?? null}
            playing={player.playing}
            onPlay={(r) => (player.current?.id === r.songId ? player.toggle() : player.playQueue(playable, r.songId, 'Downloads'))}
            onLyrics={(r) => router.push(`/song/${r.song.slug}/lyrics`)}
            onRemove={(r) => void offline.remove(r.songId)}
          />
          <section className="section" aria-label="Remove all downloads">
            {confirmAll ? (
              <div className="card" role="group" aria-label="Confirm removing all downloads">
                <p style={{ margin: '0 0 12px' }}><strong>Remove every download from this phone?</strong></p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn" onClick={() => void offline.removeAll().then(() => setConfirmAll(false))}>Yes, remove all</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setConfirmAll(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button type="button" className="btn btn-block" onClick={() => setConfirmAll(true)}>Remove all downloads</button>
            )}
          </section>
        </>
      )}
      <p className="small muted section">
        Downloads are for your own listening on this phone. An artist can withdraw permission, and then the song is removed from your phone
        the next time the app is online. Signing out removes all downloads.
      </p>
    </div>
  );
}
