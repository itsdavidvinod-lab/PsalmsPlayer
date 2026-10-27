import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Language, Region } from '@/lib/types';
import LanguageForm from '../LanguageForm';
import SettingsTop from '../SettingsTop';

export const metadata: Metadata = { title: 'Language and region' };
export const dynamic = 'force-dynamic';

export default async function LanguagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings%2Flanguage');

  const [profileRes, languagesRes, regionsRes] = await Promise.all([
    supabase.from('profiles').select('language_codes, region_code').eq('id', user.id).maybeSingle(),
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name, country_code').order('name'),
  ]);
  const profile = (profileRes.data ?? { language_codes: [], region_code: null }) as { language_codes: string[]; region_code: string | null };
  const failed = Boolean(profileRes.error || languagesRes.error || regionsRes.error);

  return (
    <div>
      <SettingsTop title="Language and region" />
      <p className="muted small" style={{ margin: '4px 0 0' }}>Home shows songs and notices in your languages and region first.</p>
      {failed ? <p className="error" role="alert">Settings could not be loaded. Please refresh in a moment.</p> : null}
      <LanguageForm
        userId={user.id}
        languageCodes={profile.language_codes}
        regionCode={profile.region_code}
        languages={(languagesRes.data ?? []) as Language[]}
        regions={(regionsRes.data ?? []) as Region[]}
      />
    </div>
  );
}
