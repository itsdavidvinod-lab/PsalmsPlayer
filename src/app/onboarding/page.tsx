import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_NAME } from '@/lib/brand';
import { safeNextPath } from '@/lib/share';
import { createClient } from '@/lib/supabase/server';
import type { Language, Region } from '@/lib/types';
import OnboardingForm from './OnboardingForm';

export const metadata: Metadata = { title: 'Welcome' };
export const dynamic = 'force-dynamic';

// The first step after a new account signs in with Google: choose languages and region. It is outside the signed-in layout on purpose
// (no menu, nothing else to tap) and the middleware already sends anyone who is not signed in to /login.
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next ?? null);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/onboarding')}`);

  const [profileRes, languagesRes, regionsRes] = await Promise.all([
    supabase.from('profiles').select('display_name, language_codes, region_code, onboarded_at').eq('id', user.id).maybeSingle(),
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name, country_code').order('name'),
  ]);
  const profile = profileRes.data as { display_name: string | null; language_codes: string[]; region_code: string | null; onboarded_at: string | null } | null;
  // Already done (or skipped) once: nothing more to ask.
  if (profile && profile.onboarded_at !== null) redirect(next);
  const failed = Boolean(profileRes.error || languagesRes.error || regionsRes.error);
  const firstName = (profile?.display_name ?? '').trim().split(/\s+/)[0] ?? '';

  return (
    <main className="onboarding">
      <h1>{firstName ? `Welcome, ${firstName}` : `Welcome to ${APP_NAME}`}</h1>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        Choose your languages and region, and Home shows your songs and notices first. You can change this any time in Settings.
      </p>
      {failed ? <p className="error" role="alert">The choices could not be loaded. You can skip this and set them later in Settings.</p> : null}
      <OnboardingForm
        userId={user.id}
        next={next}
        languages={(languagesRes.data ?? []) as Language[]}
        regions={(regionsRes.data ?? []) as Region[]}
        languageCodes={profile?.language_codes ?? []}
        regionCode={profile?.region_code ?? null}
      />
    </main>
  );
}
