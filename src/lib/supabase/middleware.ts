import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/share';
import { supabaseEnv } from './env';

// Everything else needs a login. /get is the public landing page for shared app links; /about, /privacy and /terms are the
// public pages Google asks for on its sign-in screen. /delete-account is the web page for deletion requests that
// Google Play asks for.
const PUBLIC_PATHS = ['/login', '/auth', '/get', '/about', '/privacy', '/terms', '/delete-account'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

/** Refreshes the session cookie and sends visitors who are not signed in to /login. */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let env: { url: string; key: string };
  try {
    env = supabaseEnv();
  } catch (e) {
    return new NextResponse((e as Error).message, { status: 500 });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
      },
    },
  });

  // getUser() asks the Supabase server to validate the token. getSession() would only read the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', safeNextPath(pathname + search));
    return NextResponse.redirect(url);
  }

  if (user && pathname === '/login') {
    const url = request.nextUrl.clone();
    const next = safeNextPath(request.nextUrl.searchParams.get('next'));
    url.pathname = next.split('?')[0];
    url.search = next.includes('?') ? '?' + next.split('?').slice(1).join('?') : '';
    const redirect = NextResponse.redirect(url);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }

  return response;
}
