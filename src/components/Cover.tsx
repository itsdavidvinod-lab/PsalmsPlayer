'use client';

import { useState } from 'react';
import { coverBackground, initialOf } from '@/lib/cover';
import { displayImageUrl } from '@/lib/image-url';

// A picture with a coloured placeholder when there is none (unavailable artists have no picture by design).
// A picture that cannot be loaded (a Drive file that is not shared, a link that moved) falls back to the placeholder too.
export default function Cover({ url, name, size = 56, round = false }: { url: string | null; name: string; size?: number; round?: boolean }) {
  const radius = round ? '50%' : size <= 48 ? 6 : size <= 72 ? 8 : 12;
  const shown = displayImageUrl(url, size * 3);
  const [failed, setFailed] = useState<string | null>(null);
  if (shown && shown !== failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="cover" src={shown} alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: radius }} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(shown)} />;
  }
  return (
    <span
      className="cover cover-empty"
      style={{ width: size, height: size, borderRadius: radius, background: coverBackground(name), fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initialOf(name)}
    </span>
  );
}
