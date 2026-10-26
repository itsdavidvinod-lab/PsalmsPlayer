import { createBrowserClient } from '@supabase/ssr';
import { supabaseEnv } from './env';

/** For client components. Uses the anon key only; every rule is enforced by the database. */
export function createClient() {
  const { url, key } = supabaseEnv();
  return createBrowserClient(url, key);
}
