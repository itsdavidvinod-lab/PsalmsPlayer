import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { AdminArtistSummary, AdminSongSummary, ExpiryRow } from '@/lib/admin-types';
import { daysLeftLabel, visibilityLabel } from '@/lib/admin-text';
import PageHead from './PageHead';

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

  const stats = [
    { value: artists.length, label: 'Artists', sub: `${published} published` },
    { value: liveSongs, label: 'Songs live', sub: `of ${totalSongs}` },
    { value: totalSongs - liveSongs, label: 'Songs not live', sub: 'The reasons are listed below' },
    { value: unavailable, label: 'Shown as unavailable', sub: 'Published artists whose agreement is not in force' },
  ];

  return (
    <div>
      <PageHead
        title="Dashboard"
        sub="What is live, what is hidden and why, and what is about to expire."
        actions={
          <>
            <Link href="/admin/artists/new" className="btn">New artist</Link>
            <Link href="/admin/songs/new" className="btn btn-primary">New song</Link>
          </>
        }
      />
      {failed ? <p className="error adm-banner" role="alert">Some figures could not be loaded. Please refresh in a moment.</p> : null}

      <div className="stats">
        {stats.map((s) => (
          <div key={s.label} className="card stat">
            <strong>{s.value}</strong>
            <span className="stat-label">{s.label}</span>
            <span className="stat-sub">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="adm-two">
        <section className="adm-block" aria-labelledby="expiry">
          <h2 id="expiry">Expiring within 60 days</h2>
          <div className="adm-rows">
            {expiring.length === 0 ? (
              <div className="empty">Nothing expires in the next 60 days.</div>
            ) : (
              expiring.map((r, i) => (
                <Link key={`${r.kind}-${r.artist_id}-${r.song_id ?? ''}-${r.person_name ?? ''}-${i}`} href={`/admin/artists/${r.artist_id}`} className="row-link">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="song-title">
                      {r.kind === 'agreement' ? `Agreement: ${r.artist_name}` : `Consent: ${r.person_name ?? 'unnamed'}, ${r.song_title ?? 'a song'}`}
                    </div>
                    <div className="small muted">{r.kind === 'consent' ? `${r.artist_name} · ` : ''}Ends {r.expires_on}</div>
                  </div>
                  <span className="pill pill-gold">{daysLeftLabel(r.days_left)}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <section className="adm-block" aria-labelledby="hidden">
          <h2 id="hidden">Songs that are not live</h2>
          <div className="adm-rows">
            {hidden.length === 0 ? (
              <div className="empty">Every song is live.</div>
            ) : (
              hidden.map((s) => (
                <Link key={s.id} href={`/admin/songs/${s.id}`} className="row-link">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="song-title">{s.title}</div>
                    <div className="small muted">{s.artist_name}</div>
                  </div>
                  <span className="pill pill-quiet">{visibilityLabel(s.visibility)}</span>
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
