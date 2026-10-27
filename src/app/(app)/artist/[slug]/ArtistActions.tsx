'use client';

// The row under an artist's name: Follow on the left, Shuffle and Play on the right.

import { useState } from 'react';
import { PauseIcon, PlayIcon, ShuffleIcon } from '@/components/icons';
import { usePlayer } from '@/components/player/PlayerProvider';
import { useSongMenu } from '@/components/SongMenu';
import { createClient } from '@/lib/supabase/client';
import type { Song } from '@/lib/types';

export function FollowButton({ artistId, userId, initial }: { artistId: string; userId: string; initial: boolean }) {
  const menu = useSongMenu();
  const [following, setFollowing] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !following;
    setFollowing(next);
    const db = createClient();
    const { error } = next
      ? await db.from('artist_follows').insert({ user_id: userId, artist_id: artistId })
      : await db.from('artist_follows').delete().eq('artist_id', artistId).eq('user_id', userId);
    // 23505: already followed (another tab, a double tap). That is what was asked for.
    if (error && !(next && error.code === '23505')) {
      setFollowing(!next);
      menu.notify(error.code === '54000' ? 'You can follow up to 500 artists.' : next ? 'Could not follow. Please try again.' : 'Could not unfollow. Please try again.');
    }
    setBusy(false);
  }

  return (
    <button type="button" className="follow-btn" aria-pressed={following} disabled={busy} onClick={() => void toggle()}>
      {following ? 'Following' : 'Follow'}
    </button>
  );
}

export function PlayControls({ artistId, artistName, songs }: { artistId: string; artistName: string; songs: Song[] }) {
  const p = usePlayer();
  const firstPlayable = songs.find((s) => s.has_audio);
  const here = p.current?.artist_id === artistId;
  const busy = here && p.playing;

  function play() {
    if (here) p.toggle();
    else if (p.shuffle) p.shuffleAll(songs, artistName);
    else if (firstPlayable) p.playQueue(songs, firstPlayable.id, artistName);
  }

  if (!firstPlayable) return null;
  return (
    <>
      <button type="button" className="row-ic ctl-ic" aria-label="Shuffle" aria-pressed={p.shuffle} onClick={p.toggleShuffle}>
        <ShuffleIcon />
      </button>
      <button type="button" className="round-play round-play-md" aria-label={busy ? `Pause ${artistName}` : `Play all songs by ${artistName}`} onClick={play}>
        {busy ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
      </button>
    </>
  );
}
