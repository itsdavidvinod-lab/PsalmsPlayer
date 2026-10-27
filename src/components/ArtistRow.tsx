import Link from 'next/link';
import type { Artist } from '@/lib/types';
import Cover from './Cover';

/** An artist as a row of a card list: round picture, name, and a second line ("Artist", or "Unavailable"). */
export function ArtistRow({ artist, sub }: { artist: Pick<Artist, 'slug' | 'name' | 'available' | 'photo_url'>; sub?: string }) {
  return (
    <Link href={`/artist/${artist.slug}`} className="card-row">
      <Cover url={artist.available ? artist.photo_url : null} name={artist.name} size={40} round />
      <span className="card-row-text">
        <span className="card-row-title">{artist.name}</span>
        {artist.available ? <span className="card-row-sub">{sub ?? 'Artist'}</span> : <span className="card-row-sub">Unavailable</span>}
      </span>
    </Link>
  );
}

/** Followed artists as a grid of round pictures with their names, four to a row. */
export function ArtistGrid({ artists }: { artists: Pick<Artist, 'slug' | 'name' | 'available' | 'photo_url'>[] }) {
  return (
    <div className="artist-grid">
      {artists.map((a) => (
        <Link key={a.slug} href={`/artist/${a.slug}`} className="artist-cell">
          <Cover url={a.available ? a.photo_url : null} name={a.name} size={64} round />
          <span className="artist-cell-name">{a.name}</span>
        </Link>
      ))}
    </div>
  );
}

/** Artists in a single row that scrolls sideways (Home): round picture and name. */
export function ArtistStrip({ artists }: { artists: Pick<Artist, 'slug' | 'name' | 'available' | 'photo_url'>[] }) {
  return (
    <div className="artist-strip">
      {artists.map((a) => (
        <Link key={a.slug} href={`/artist/${a.slug}`} className="artist-chip">
          <Cover url={a.available ? a.photo_url : null} name={a.name} size={64} round />
          <span className="artist-cell-name">{a.name}</span>
        </Link>
      ))}
    </div>
  );
}
