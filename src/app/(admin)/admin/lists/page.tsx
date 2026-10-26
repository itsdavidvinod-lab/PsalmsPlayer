import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin';
import type { TagKind } from '@/lib/reference-form';
import ListEditors from '../ListEditors';

export const metadata: Metadata = { title: 'Lists · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminLists() {
  const { supabase } = await requireAdmin('/admin/lists');
  const [langRes, regionRes, tagRes] = await Promise.all([
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name, country_code').order('code'),
    supabase.from('tags').select('kind, code, label').order('label'),
  ]);
  const failed = Boolean(langRes.error || regionRes.error || tagRes.error);
  if (failed) console.error('admin lists: load failed', langRes.error ?? regionRes.error ?? tagRes.error);

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', margin: '20px 0 4px' }}>Lists</h1>
      <p className="small muted">
        The choices offered everywhere: languages, regions, genres, occasions and moods. Names can be changed at any time. A code can never be changed,
        and a value that artists, songs, listeners or posters still use cannot be deleted.
      </p>
      {failed ? <p className="error" role="alert">Some lists could not be loaded. Please refresh.</p> : null}
      <ListEditors
        languages={(langRes.data ?? []) as { code: string; name: string; native_name: string | null }[]}
        regions={(regionRes.data ?? []) as { code: string; name: string; country_code: string }[]}
        tags={(tagRes.data ?? []) as { kind: TagKind; code: string; label: string }[]}
      />
    </div>
  );
}
