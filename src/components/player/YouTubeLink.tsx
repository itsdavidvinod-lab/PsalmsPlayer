'use client';

import { youtubeWatchUrl } from '@/lib/youtube';
import { ExternalIcon } from '../icons';
import { usePlayer } from './PlayerProvider';

/** A plain link out to YouTube. On a phone it opens the YouTube app. Our audio is paused first, so two songs never play at once. */
export default function YouTubeLink({ youtubeId, compact = false }: { youtubeId: string; compact?: boolean }) {
  const { pause } = usePlayer();
  return (
    <a
      href={youtubeWatchUrl(youtubeId)}
      target="_blank"
      rel="noopener noreferrer"
      className={compact ? 'icon-btn' : 'btn'}
      aria-label={compact ? 'Watch on YouTube' : undefined}
      onClick={pause}
    >
      <ExternalIcon />
      {compact ? null : <span>Watch on YouTube</span>}
    </a>
  );
}
