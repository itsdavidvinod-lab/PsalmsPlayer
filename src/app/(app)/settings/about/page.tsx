import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { APP_NAME } from '@/lib/brand';
import type { SiteContact } from '@/lib/site-contacts';
import { createClient } from '@/lib/supabase/server';
import SettingsTop from '../SettingsTop';
import ContactList from './ContactList';

export const metadata: Metadata = { title: 'About' };
export const dynamic = 'force-dynamic';

export default async function AboutPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsettings%2Fabout');

  // The ways to reach us are set by the admin (Admin, Contact). Only the ones switched on are shown.
  const { data: contactRows, error: contactError } = await supabase
    .from('site_contacts')
    .select('id, kind, label, value')
    .eq('is_active', true)
    .order('sort_order')
    .order('created_at');
  if (contactError) console.error('about: contact options failed', contactError);
  const contacts = (contactRows ?? []) as Pick<SiteContact, 'id' | 'kind' | 'label' | 'value'>[];

  return (
    <div>
      <SettingsTop title="About" />
      <div className="card section">
        <p style={{ margin: 0, fontWeight: 600 }}>{APP_NAME}</p>
        <p className="muted" style={{ margin: '6px 0 0' }}>Songs, lyrics and chords. Listen, follow the words, and take a setlist on stage.</p>
      </div>
      <ContactList contacts={contacts} />
    </div>
  );
}
