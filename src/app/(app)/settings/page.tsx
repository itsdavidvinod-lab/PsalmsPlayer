import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Language, Profile, Region } from '@/lib/types';
import SettingsForm from './SettingsForm';

export const metadata: Metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings');

  const [profileRes, languagesRes, regionsRes] = await Promise.all([
    supabase.from('profiles').select('display_name, role, language_codes, region_code').eq('id', user.id).maybeSingle(),
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name, country_code').order('name'),
  ]);

  const profile = (profileRes.data ?? { display_name: null, role: 'user', language_codes: [], region_code: null }) as Profile;
  const failed = Boolean(profileRes.error || languagesRes.error || regionsRes.error);

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', margin: '8px 0 4px' }}>Settings</h1>
      <p className="muted">{user.email}</p>
      {failed ? <p className="error" role="alert">Settings could not be loaded. Please refresh in a moment.</p> : null}
      <SettingsForm
        userId={user.id}
        profile={profile}
        languages={(languagesRes.data ?? []) as Language[]}
        regions={(regionsRes.data ?? []) as Region[]}
      />
    </div>
  );
}
