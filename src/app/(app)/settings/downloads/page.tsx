import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SettingsTop from '../SettingsTop';
import DownloadsManager from './DownloadsManager';

export const metadata: Metadata = { title: 'Downloads' };
export const dynamic = 'force-dynamic';

export default async function DownloadsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings%2Fdownloads');

  return (
    <div>
      <SettingsTop title="Downloads" />
      <DownloadsManager />
    </div>
  );
}
