import type { Metadata } from 'next';
import { requireAdmin } from '@/lib/admin';
import type { SiteContact } from '@/lib/site-contacts';
import ContactEditor from '../ContactEditor';
import PageHead from '../PageHead';

export const metadata: Metadata = { title: 'Contact · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminContact() {
  const { supabase } = await requireAdmin('/admin/contact');
  const { data, error } = await supabase.from('site_contacts').select('id, kind, label, value, sort_order, is_active').order('sort_order').order('created_at');
  if (error) console.error('admin contact: load failed', error);

  return (
    <div>
      <PageHead
        title="Contact options"
        sub="How people reach you. They appear under Settings, About, Contact us, in this order. Add as many as you need: a WhatsApp number, an email address, a phone number or a link."
      />
      {error ? <p className="error adm-banner" role="alert">The options could not be loaded. Please refresh.</p> : null}
      <ContactEditor contacts={(data ?? []) as SiteContact[]} />
    </div>
  );
}
