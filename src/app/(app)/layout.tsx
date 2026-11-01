import AppShell, { type ShellUser } from '@/components/AppShell';
import { createClient } from '@/lib/supabase/server';
import { profilePicture } from '@/lib/user';

// Every signed-in page lives inside this layout. It stays mounted while people move around, which is what keeps the music playing.
// Each page still checks the session itself; the middleware has already sent signed-out visitors to /login.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let shellUser: ShellUser | null = null;
  let likedIds: string[] = [];
  if (user) {
    const [profileRes, likesRes] = await Promise.all([
      supabase.from('profiles').select('display_name, role, avatar_url').eq('id', user.id).maybeSingle(),
      supabase.from('song_likes').select('song_id').eq('user_id', user.id).limit(1000),
    ]);
    if (likesRes.error) console.error('layout: liked songs failed', likesRes.error);
    likedIds = ((likesRes.data ?? []) as { song_id: string }[]).map((r) => r.song_id);
    const profile = profileRes.data as { display_name: string | null; role: string; avatar_url: string | null } | null;
    shellUser = {
      id: user.id,
      name: profile?.display_name ?? null,
      email: user.email ?? null,
      avatarUrl: profilePicture(profile?.avatar_url, user.user_metadata),
      isAdmin: profile?.role === 'admin',
    };
  }

  return (
    <AppShell user={shellUser} likedIds={likedIds}>
      {children}
    </AppShell>
  );
}
