'use client';

// "Explore": four ways to browse (Genre, Occasion, Mood, Language) and a grid of coloured tiles for the chosen one.
// A tile opens the results of that filter.

import Link from 'next/link';
import { useState } from 'react';
import { TileIcon } from '@/components/icons';
import { COVER_PALETTE } from '@/lib/cover';
import { searchHref, type FilterKind, type SearchState } from '@/lib/search';

function tileHref(kind: FilterKind, value: string): string {
  const target: Partial<SearchState> = {};
  target[kind] = value;
  return searchHref(target);
}

export type TileGroup = { kind: FilterKind; title: string; tiles: { value: string; label: string }[] };

export default function ExploreTiles({ groups }: { groups: TileGroup[] }) {
  const [kind, setKind] = useState<FilterKind | null>(groups[0]?.kind ?? null);
  const group = groups.find((g) => g.kind === kind) ?? groups[0];
  if (!group) return null;

  return (
    <>
      <div className="chip-row" role="group" aria-label="Explore by">
        {groups.map((g) => (
          <button key={g.kind} type="button" className="chip" aria-pressed={g.kind === group.kind} onClick={() => setKind(g.kind)}>
            {g.title}
          </button>
        ))}
      </div>
      <div className="tile-grid">
        {group.tiles.map((t, i) => {
          const [a, b] = COVER_PALETTE[i % COVER_PALETTE.length];
          return (
            <Link key={t.value} href={tileHref(group.kind, t.value)} className="tile" style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
              <span className="tile-name">{t.label}</span>
              <span className="tile-art"><TileIcon index={i} /></span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
