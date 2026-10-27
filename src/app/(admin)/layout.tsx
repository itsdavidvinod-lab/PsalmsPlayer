import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { APP_NAME } from '@/lib/brand';
import { AdminIcon } from './admin/AdminIcons';
import AdminNav from './admin/AdminNav';

// The admin site is a website only: it is not part of the phone apps. It has its own frame (a left menu on a laptop, a row
// of links on a phone) and no player. The first load is checked here; every page checks again, because moving between
// admin pages does not render this layout a second time.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireAdmin('/admin');
  return (
    <div className="admin-wrap">
      <aside className="admin-side">
        <Link href="/admin" className="admin-brand">
          <span>{APP_NAME}</span>
          <span className="pill">Admin</span>
        </Link>
        <AdminNav />
        <div className="admin-side-foot">
          <Link href="/" className="admin-back">
            <AdminIcon name="back" />
            Back to the site
          </Link>
          <div className="admin-who">
            <span className="admin-who-icon"><AdminIcon name="user" size={18} /></span>
            <span className="admin-who-text">
              <span className="admin-who-name">Signed in as admin</span>
              <span className="admin-who-sub">{user.email ?? 'Google account'}</span>
            </span>
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <div className="admin-page">{children}</div>
      </main>
    </div>
  );
}
