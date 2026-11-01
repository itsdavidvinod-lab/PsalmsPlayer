import { ChatIcon, ExternalIcon, MailIcon, PhoneIcon } from '@/components/icons';
import { contactDisplay, contactHref, type ContactKind, type SiteContact } from '@/lib/site-contacts';

function KindIcon({ kind }: { kind: ContactKind }) {
  if (kind === 'whatsapp') return <ChatIcon size={22} />;
  if (kind === 'email') return <MailIcon size={22} />;
  if (kind === 'phone') return <PhoneIcon size={22} />;
  return <ExternalIcon size={22} />;
}

/** The ways to reach us, as buttons. WhatsApp and links open outside the app (the chat app or the browser); email and phone open the phone's own apps. */
export default function ContactList({ contacts }: { contacts: Pick<SiteContact, 'id' | 'kind' | 'label' | 'value'>[] }) {
  if (contacts.length === 0) return null;
  return (
    <section className="section" aria-labelledby="contact-us">
      <h2 id="contact-us">Contact us</h2>
      <p className="muted small" style={{ margin: '4px 0 0' }}>A question, a song to add, or something wrong? Write to us.</p>
      <div className="contact-list">
        {contacts.map((c) => {
          const external = c.kind === 'whatsapp' || c.kind === 'link';
          return (
            <a
              key={c.id}
              className={`contact-btn contact-${c.kind}`}
              href={contactHref(c.kind, c.value)}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              <span className="contact-ic"><KindIcon kind={c.kind} /></span>
              <span className="contact-text">
                <span className="contact-label">{c.label}</span>
                <span className="contact-sub">{contactDisplay(c.kind, c.value)}</span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
