import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import PageHead from '../../PageHead';
import RequestForm from '../../RequestForm';

export const metadata: Metadata = { title: 'New request · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewRequest() {
  await requireAdmin('/admin/requests/new');
  return (
    <div>
      <PageHead title="New request" crumbs={<Link href="/admin/requests" className="inline">Requests</Link>} />
      <section className="section" aria-labelledby="req-details" style={{ marginTop: 0 }}>
        <h2 id="req-details">Request</h2>
        <RequestForm request={null} />
      </section>
    </div>
  );
}
