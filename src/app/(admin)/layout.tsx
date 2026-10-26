import Link from 'next/link';
import { BrandMark } from '@/components/Header';
import { requireAdmin } from '@/lib/admin';
import { APP_NAME } from '@/lib/brand';
import AdminNav from './admin/AdminNav';

// The admin site has its own frame and no player. The first load is checked here; every page checks again, because
// moving between admin pages does not render this layout a second time.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin('/admin');
  return (
    <div className="admin-wrap">
      <header className="admin-top">
        <Link href="/admin" className="brand">
          <BrandMark />
          <span>{APP_NAME} admin</span>
        </Link>
        <AdminNav />
        <Link href="/" className="btn btn-ghost">Back to the site</Link>
      </header>
      <main>{children}</main>
    </div>
  );
}
