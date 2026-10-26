import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import RequestForm from '../../RequestForm';

export const metadata: Metadata = { title: 'New request · Admin' };
export const dynamic = 'force-dynamic';

export default async function NewRequest() {
  await requireAdmin('/admin/requests/new');
  return (
    <div>
      <p className="small" style={{ margin: '16px 0 0' }}><Link href="/admin/requests" className="inline">Requests</Link></p>
      <h1 style={{ fontSize: '1.6rem', margin: '4px 0 12px' }}>New request</h1>
      <RequestForm request={null} />
    </div>
  );
}
