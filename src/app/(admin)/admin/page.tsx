import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { AdminArtistSummary, AdminSongSummary, ExpiryRow } from '@/lib/admin-types';
import { daysLeftLabel, visibilityLabel } from '@/lib/admin-text';

export const metadata: Metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const { supabase } = await requireAdmin('/admin');

  const [artistsRes, hiddenRes, expiryRes] = await Promise.all([
    supabase.from('v_admin_artists').select('*').order('name'),
    supabase.from('v_admin_songs').select('id, slug, title, artist_id, artist_name, visibility').neq('visibility', 'live').order('title'),
    supabase.from('v_expiry_watch').select('*').order('days_left'),
  ]);
  const failed = Boolean(artistsRes.error || hiddenRes.error || expiryRes.error);
  if (failed) console.error('admin dashboard: load failed', artistsRes.error ?? hiddenRes.error ?? expiryRes.error);

  const artists = (artistsRes.data ?? []) as AdminArtistSummary[];
  const hidden = (hiddenRes.data ?? []) as Pick<AdminSongSummary, 'id' | 'slug' | 'title' | 'artist_id' | 'artist_name' | 'visibility'>[];
  const expiring = (expiryRes.data ?? []) as ExpiryRow[];

  const totalSongs = artists.reduce((n, a) => n + a.song_count, 0);
  const liveSongs = artists.reduce((n, a) => n + a.live_song_count, 0);
  const published = artists.filter((a) => a.is_published).length;
  const unavailable = artists.filter((a) => a.is_published && !a.available).length;

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', margin: '20px 0 4px' }}>Dashboard</h1>
      {failed ? <p className="error" role="alert">Some figures could not be loaded. Please refresh in a moment.</p> : null}

      <div className="stats" style={{ marginTop: 12 }}>
        <div className="card stat"><strong>{artists.length}</strong><span className="muted small">Artists ({published} published)</span></div>
        <div className="card stat"><strong>{liveSongs}</strong><span className="muted small">Songs live, of {totalSongs}</span></div>
        <div className="card stat"><strong>{totalSongs - liveSongs}</strong><span className="muted small">Songs not live</span></div>
        <div className="card stat"><strong>{unavailable}</strong><span className="muted small">Published artists shown as unavailable</span></div>
      </div>

      <section className="section" aria-labelledby="expiry">
        <h2 id="expiry">Expiring within 60 days</h2>
        {expiring.length === 0 ? (
          <div className="card empty">Nothing expires in the next 60 days.</div>
        ) : (
          <div className="grid-list">
            {expiring.map((r, i) => (
              <Link key={`${r.kind}-${r.artist_id}-${r.song_id ?? ''}-${r.person_name ?? ''}-${i}`} href={`/admin/artists/${r.artist_id}`} className="row-link">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="song-title">
                    {r.kind === 'agreement' ? `Agreement: ${r.artist_name}` : `Consent: ${r.person_name ?? 'unnamed'}, ${r.song_title ?? 'a song'}`}
                  </div>
                  <div className="small muted">{r.kind === 'consent' ? `${r.artist_name} · ` : ''}Ends {r.expires_on}</div>
                </div>
                <span className="pill pill-gold">{daysLeftLabel(r.days_left)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="hidden">
        <h2 id="hidden">Songs that are not live</h2>
        {hidden.length === 0 ? (
          <div className="card empty">Every song is live.</div>
        ) : (
          <div className="grid-list">
            {hidden.map((s) => (
              <Link key={s.id} href={`/admin/songs/${s.id}`} className="row-link">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="song-title">{s.title}</div>
                  <div className="small muted">{s.artist_name}</div>
                </div>
                <span className="pill pill-quiet">{visibilityLabel(s.visibility)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
