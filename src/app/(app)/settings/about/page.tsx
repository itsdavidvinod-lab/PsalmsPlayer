import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_NAME } from '@/lib/brand';
import { createClient } from '@/lib/supabase/server';
import SettingsTop from '../SettingsTop';

export const metadata: Metadata = { title: 'About' };
export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings%2Fabout');

  return (
    <div>
      <SettingsTop title="About" />
      <div className="card section">
        <p style={{ margin: 0, fontWeight: 600 }}>{APP_NAME}</p>
        <p className="muted" style={{ margin: '6px 0 0' }}>Songs, lyrics and chords for the Christian community. Listen, follow the words, and take a setlist on stage.</p>
      </div>
    </div>
  );
}
