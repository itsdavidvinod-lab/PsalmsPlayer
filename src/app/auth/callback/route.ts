import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/share';
import { createClient } from '@/lib/supabase/server';

// Google sign-in and email confirmation links both land here with a one-time code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  return NextResponse.redirect(new URL('/login?error=callback', origin));
}
