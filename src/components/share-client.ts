'use client';

import { buildShareUrl, shareMessage } from '@/lib/share';

/** Which of the two share links the "Share link" button gives. Lyrics stay behind login either way.
 *  Switch to 'app' when the apps are in the stores: that link sends people to the right store first. */
export const SHARE_LINK_KIND = 'web' as const;

export type ShareOutcome = { kind: 'shared' } | { kind: 'copied' } | { kind: 'link'; url: string } | { kind: 'cancelled' };

/** Opens the phone's share sheet when there is one, otherwise copies the link. When even copying is refused,
 *  the link is handed back so the screen can show it for the person to copy by hand. */
export async function shareSong(song: { slug: string; title: string }): Promise<ShareOutcome> {
  const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
  const url = buildShareUrl(SHARE_LINK_KIND, song.slug, origin);
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: song.title, text: shareMessage(song.title, url), url });
      return { kind: 'shared' };
    } catch {
      return { kind: 'cancelled' }; // the person closed the share sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return { kind: 'copied' };
  } catch {
    return { kind: 'link', url };
  }
}
