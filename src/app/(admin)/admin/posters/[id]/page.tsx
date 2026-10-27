import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import { loadPosterChoices } from '@/lib/admin-data';
import type { AdminPoster } from '@/lib/admin-types';
import { isUuid } from '@/lib/admin-text';
import { posterPhase } from '@/lib/ledger';
import PageHead from '../../PageHead';
import PosterForm from '../../PosterForm';

export const metadata: Metadata = { title: 'Poster · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminPosterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireAdmin(`/admin/posters/${id}`);
  const [posterRes, choices] = await Promise.all([
    supabase
      .from('posters')
      .select('id, request_id, kind, title, image_url, youtube_id, target_language_codes, target_region_codes, match_mode, event_date, starts_at, ends_at, status, created_at')
      .eq('id', id)
      .maybeSingle(),
    loadPosterChoices(supabase),
  ]);
  if (!posterRes.data) notFound();
  const poster = posterRes.data as AdminPoster;
  const phase = posterPhase(poster, Date.now());
  const phaseText =
    phase === 'showing' ? 'Showing on Home now.'
    : phase === 'scheduled' ? 'Approved and waiting for its start time.'
    : phase === 'ended' ? 'Its dates have passed. It no longer shows.'
    : 'Not showing: it is not Approved.';

  return (
    <div>
      <PageHead
        title={poster.title}
        crumbs={
          <>
            <Link href="/admin/posters" className="inline">Posters</Link>
            {poster.request_id ? (
              <>
                {' · '}
                <Link href={`/admin/requests/${poster.request_id}`} className="inline">Its request</Link>
              </>
            ) : null}
          </>
        }
      />
      {posterRes.error || choices.failed ? <p className="error adm-banner" role="alert">Some parts of this page could not be loaded. Please refresh.</p> : null}
      <div className={`${phase === 'showing' ? 'ok' : 'notice'} adm-banner`} role="status" aria-label="Poster status">
        <strong>{phaseText}</strong>
      </div>
      <PosterForm poster={poster} requests={choices.requests} languages={choices.languages} regions={choices.regions} initialRequestId="" />
    </div>
  );
}
