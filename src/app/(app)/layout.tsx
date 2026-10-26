import AppShell from '@/components/AppShell';

// Every signed-in page lives inside this layout. It stays mounted while people move around, which is what keeps the music playing.
// Each page still checks the session itself; the middleware has already sent signed-out visitors to /login.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
