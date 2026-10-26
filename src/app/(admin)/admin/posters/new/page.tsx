import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { loadPosterChoices } from '@/lib/admin-data';
import { isUuid } from '@/lib/admin-text';
import PosterForm from '../../PosterForm';

export const metadata: Metadata = { title: 'New poster · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewPoster({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request } = await searchParams;
  const { supabase } = await requireAdmin('/admin/posters/new');
  const choices = await loadPosterChoices(supabase);

  return (
    <div>
      <p className="small" style={{ margin: '16px 0 0' }}><Link href="/admin/posters" className="inline">Posters</Link></p>
      <h1 style={{ fontSize: '1.6rem', margin: '4px 0 12px' }}>New poster</h1>
      {choices.failed ? <p className="error" role="alert">Some choices could not be loaded. Please refresh.</p> : null}
      <PosterForm
        poster={null}
        requests={choices.requests}
        languages={choices.languages}
        regions={choices.regions}
        initialRequestId={request && isUuid(request) && choices.requests.some((r) => r.id === request) ? request : ''}
      />
    </div>
  );
}
