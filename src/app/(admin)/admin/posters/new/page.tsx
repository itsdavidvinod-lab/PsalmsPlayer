import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { loadPosterChoices } from '@/lib/admin-data';
import { isUuid } from '@/lib/admin-text';
import PageHead from '../../PageHead';
import PosterForm from '../../PosterForm';

export const metadata: Metadata = { title: 'New poster · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewPoster({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request } = await searchParams;
  const { supabase } = await requireAdmin('/admin/posters/new');
  const choices = await loadPosterChoices(supabase);

  return (
    <div>
      <PageHead title="New poster" crumbs={<Link href="/admin/posters" className="inline">Posters</Link>} />
      {choices.failed ? <p className="error adm-banner" role="alert">Some choices could not be loaded. Please refresh.</p> : null}
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
