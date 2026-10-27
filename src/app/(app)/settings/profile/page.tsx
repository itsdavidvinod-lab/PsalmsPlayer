import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { pictureFromMetadata } from '@/lib/user';
import ProfileForm from '../ProfileForm';
import SettingsTop from '../SettingsTop';

export const metadata: Metadata = { title: 'Profile' };
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings%2Fprofile');

  const { data, error } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
  return (
    <div>
      <SettingsTop title="Profile" />
      {error ? <p className="error" role="alert">Your profile could not be loaded. Please refresh in a moment.</p> : null}
      <ProfileForm
        userId={user.id}
        displayName={(data as { display_name: string | null } | null)?.display_name ?? null}
        email={user.email ?? null}
        pictureUrl={pictureFromMetadata(user.user_metadata)}
      />
    </div>
  );
}
