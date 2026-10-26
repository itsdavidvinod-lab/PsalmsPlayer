import Link from 'next/link';
import type { Song } from '@/lib/types';

export default function SongRow({ song }: { song: Song }) {
  return (
    <Link href={`/song/${song.slug}`} className="song-row">
      <div>
        <div className="song-title">{song.title}</div>
        <div className="small muted">
          {song.artist_name}
          {song.album_title ? ` · ${song.album_title}` : ''}
        </div>
      </div>
      <div className="song-meta">
        {song.musical_key ? <span className="pill">{song.musical_key}</span> : null}
        <span className="small muted">{song.language_code}</span>
      </div>
    </Link>
  );
}
