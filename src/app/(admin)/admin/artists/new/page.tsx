import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { Option } from '@/lib/admin-types';
import ArtistForm from '../../ArtistForm';
import PageHead from '../../PageHead';

export const metadata: Metadata = { title: 'New artist · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewArtist() {
  const { supabase } = await requireAdmin('/admin/artists/new');
  const [langRes, regionRes, tagRes] = await Promise.all([
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name').order('name'),
    supabase.from('tags').select('code, label').eq('kind', 'genre').order('label'),
  ]);
  const languages: Option[] = (langRes.data ?? []).map((l: { code: string; name: string; native_name: string | null }) => ({
    value: l.code,
    label: l.native_name && l.native_name !== l.name ? `${l.name} · ${l.native_name}` : l.name,
  }));
  const regions: Option[] = (regionRes.data ?? []).map((r: { code: string; name: string }) => ({ value: r.code, label: r.name }));
  const genres: Option[] = (tagRes.data ?? []).map((t: { code: string; label: string }) => ({ value: t.code, label: t.label }));

  return (
    <div>
      <PageHead title="New artist" crumbs={<Link href="/admin/artists" className="inline">Artists</Link>} />
      {langRes.error || regionRes.error || tagRes.error ? <p className="error adm-banner" role="alert">Some choices could not be loaded. Please refresh.</p> : null}
      <section className="section" aria-labelledby="profile" style={{ marginTop: 0 }}>
        <h2 id="profile">Profile</h2>
        <ArtistForm artist={null} languages={languages} regions={regions} genres={genres} />
      </section>
    </div>
  );
}
