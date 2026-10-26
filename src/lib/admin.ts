import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

/**
 * Every admin page calls this first. Signed-out visitors go to login; anyone who is not an admin gets the same "not available"
 * page as for an address that does not exist, so the site never confirms that an admin area is there.
 * This is a convenience, not the lock: the database refuses admin reads and writes to everyone else.
 */
export async function requireAdmin(next: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data } = await supabase.rpc('is_admin');
  if (data !== true) notFound();
  return { supabase, user };
}
