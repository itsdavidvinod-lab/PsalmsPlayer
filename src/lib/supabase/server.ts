import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseEnv } from './env';

/** For server components and route handlers. Acts as the signed-in user, so row-level security applies. */
export async function createClient() {
  const { url, key } = supabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a server component, which cannot set cookies. The middleware refreshes the session instead.
        }
      },
    },
  });
}
