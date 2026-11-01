import { NextResponse, type NextRequest } from 'next/server';
import { afterSignInPath } from '@/lib/onboarding';
import { safeNextPath } from '@/lib/share';
import { createClient } from '@/lib/supabase/server';

// Google sign-in and email confirmation links both land here with a one-time code.
// A brand-new account goes on to the first-step page (languages and region) before the page it asked for.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      let onboardedAt: string | null | undefined;
      if (data.user) {
        const profile = await supabase.from('profiles').select('onboarded_at').eq('id', data.user.id).maybeSingle();
        if (profile.error) console.error('auth callback: profile read failed', profile.error);
        else if (profile.data) onboardedAt = (profile.data as { onboarded_at: string | null }).onboarded_at;
      }
      return NextResponse.redirect(new URL(afterSignInPath(onboardedAt, next), origin));
    }
  }
  return NextResponse.redirect(new URL('/login?error=callback', origin));
}
