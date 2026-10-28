import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signInMethodLabel } from '@/lib/user';
import SettingsTop from '../SettingsTop';
import DeleteAccount from './DeleteAccount';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings%2Faccount');

  const { data: profileRow } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = (profileRow as { role: string } | null)?.role === 'admin';

  return (
    <div>
      <SettingsTop title="Account" />
      <dl className="card section kv">
        <div>
          <dt>Signed in as</dt>
          <dd>{user.email ?? 'Unknown'}</dd>
        </div>
        <div>
          <dt>Sign-in method</dt>
          <dd>{signInMethodLabel(user.app_metadata?.provider)}</dd>
        </div>
      </dl>
      <form action="/auth/signout" method="post" className="section">
        <button type="submit" className="btn btn-block">Sign out</button>
      </form>
      <DeleteAccount isAdmin={isAdmin} />
    </div>
  );
}
