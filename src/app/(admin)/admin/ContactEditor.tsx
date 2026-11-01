'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CONTACT_KINDS, contactDisplay, kindLabel, normalizeContactValue, validateContact, type ContactKind, type SiteContact } from '@/lib/site-contacts';
import { explainAdminError } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

/** Add (contact = null) or edit one option. Saved straight to the database as the signed-in admin; the database enforces who may. */
function ContactForm({ contact, nextOrder }: { contact: SiteContact | null; nextOrder: number }) {
  const router = useRouter();
  const idp = `contact-${contact?.id ?? 'new'}`;
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? 'whatsapp');
  const [label, setLabel] = useState(contact?.label ?? CONTACT_KINDS[0].labelHint);
  const [value, setValue] = useState(contact?.value ?? '');
  const [order, setOrder] = useState(String(contact?.sort_order ?? nextOrder));
  const [active, setActive] = useState(contact?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [msg, setMsg] = useState<Status>(null);
  const spec = CONTACT_KINDS.find((k) => k.value === kind) ?? CONTACT_KINDS[0];

  function changeKind(next: ContactKind) {
    // A button text that was only the old type's suggestion follows the new type; one the admin wrote is kept.
    if (CONTACT_KINDS.some((k) => k.labelHint === label) || label.trim() === '') {
      setLabel(CONTACT_KINDS.find((k) => k.value === next)?.labelHint ?? '');
    }
    setKind(next);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const problem = validateContact({ kind, label, value });
    if (problem) return setMsg({ ok: false, text: problem });
    const order_n = Number(order);
    if (!Number.isInteger(order_n) || order_n < 0 || order_n > 1000) return setMsg({ ok: false, text: 'The order is a whole number from 0 to 1000.' });
    const row = { kind, label: label.trim(), value: normalizeContactValue(kind, value), sort_order: order_n, is_active: active };
    setBusy(true);
    const supabase = createClient();
    const { error } = contact ? await supabase.from('site_contacts').update(row).eq('id', contact.id) : await supabase.from('site_contacts').insert(row);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    if (!contact) {
      setKind('whatsapp');
      setLabel(CONTACT_KINDS[0].labelHint);
      setValue('');
      setOrder(String(nextOrder + 1));
      setActive(true);
    } else {
      setValue(row.value);
    }
    setMsg({ ok: true, text: contact ? 'Saved.' : 'Option added.' });
    router.refresh();
  }

  async function remove() {
    if (!contact) return;
    setBusy(true);
    const { error } = await createClient().from('site_contacts').delete().eq('id', contact.id);
    setBusy(false);
    setConfirmDelete(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="adm-form" style={{ marginTop: 12 }}>
      <div className="field">
        <label htmlFor={`${idp}-kind`}>Type</label>
        <select id={`${idp}-kind`} className="input" value={kind} onChange={(e) => changeKind(e.target.value as ContactKind)}>
          {CONTACT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-value`}>{spec.valueLabel}</label>
        <input id={`${idp}-value`} className="input" maxLength={300} inputMode={kind === 'email' ? 'email' : kind === 'link' ? 'url' : 'tel'} value={value} placeholder={spec.placeholder} onChange={(e) => setValue(e.target.value)} />
        <span className="small muted">{spec.help}</span>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-label`}>Button text</label>
        <input id={`${idp}-label`} className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />
        <span className="small muted">What people read on the button.</span>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-order`}>Order</label>
        <input id={`${idp}-order`} className="input" inputMode="numeric" maxLength={4} value={order} onChange={(e) => setOrder(e.target.value)} style={{ maxWidth: 120 }} />
        <span className="small muted">Smaller numbers come first.</span>
      </div>
      <div className="field">
        <label className="check" htmlFor={`${idp}-active`} style={{ width: 'fit-content' }}>
          <input id={`${idp}-active`} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <span>Show it to people</span>
        </label>
        <span className="small muted">Untick to hide it without deleting it.</span>
      </div>
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p> : null}
      <div className="toolbar" style={{ margin: 0 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{contact ? 'Save option' : 'Add option'}</button>
        {contact && !confirmDelete ? <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Delete</button> : null}
        {contact && confirmDelete ? (
          <>
            <span>Delete this option for good?</span>
            <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Yes, delete</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </>
        ) : null}
      </div>
    </form>
  );
}

/** The options under Settings, About, Contact us. Each can be edited, hidden or deleted; "+ Add option" makes a new one. */
export default function ContactEditor({ contacts }: { contacts: SiteContact[] }) {
  const nextOrder = contacts.reduce((m, c) => Math.max(m, c.sort_order), 0) + 1;
  return (
    <div>
      {contacts.length === 0 ? <p className="muted small">No options yet, so the Contact us section is not shown to anyone. Add your WhatsApp number to start.</p> : null}
      <div className="grid-list">
        {contacts.map((c) => (
          <details key={c.id} className="card">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              {c.label} <span className="pill pill-quiet">{kindLabel(c.kind)}</span>{' '}
              <span className="small muted">{contactDisplay(c.kind, c.value)}</span>{' '}
              {c.is_active ? null : <span className="pill pill-gold">Hidden</span>}
            </summary>
            <ContactForm contact={c} nextOrder={nextOrder} />
          </details>
        ))}
      </div>
      <details className="card" style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>+ Add option</summary>
        <ContactForm contact={null} nextOrder={nextOrder} />
      </details>
    </div>
  );
}
