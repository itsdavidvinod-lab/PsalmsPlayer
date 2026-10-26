'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminSongSummary } from '@/lib/admin-types';
import { visibilityLabel } from '@/lib/admin-text';

/** Every song with the reason it is hidden, and a box to narrow the list. */
export default function SongTable({ songs }: { songs: AdminSongSummary[] }) {
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<'all' | 'live' | 'hidden'>('all');
  const q = query.trim().toLowerCase();
  const rows = songs.filter((s) => {
    if (show === 'live' && s.visibility !== 'live') return false;
    if (show === 'hidden' && s.visibility === 'live') return false;
    return q === '' || s.title.toLowerCase().includes(q) || s.artist_name.toLowerCase().includes(q);
  });

  return (
    <div>
      <div className="search">
        <label htmlFor="song-search" className="small" style={{ position: 'absolute', left: -9999 }}>Search songs</label>
        <input id="song-search" className="input" type="search" placeholder="Search by title or artist" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label htmlFor="song-show" className="small" style={{ position: 'absolute', left: -9999 }}>Show</label>
        <select id="song-show" className="input" value={show} onChange={(e) => setShow(e.target.value as 'all' | 'live' | 'hidden')}>
          <option value="all">All songs</option>
          <option value="live">Live only</option>
          <option value="hidden">Not live only</option>
        </select>
      </div>
      <p className="small muted" role="status">{rows.length} of {songs.length} songs</p>
      <div className="grid-list">
        {rows.map((s) => (
          <Link key={s.id} href={`/admin/songs/${s.id}`} className="row-link">
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="song-title">{s.title}</div>
              <div className="small muted">{s.artist_name}</div>
            </div>
            <span className={s.visibility === 'live' ? 'pill' : 'pill pill-quiet'}>{visibilityLabel(s.visibility)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
