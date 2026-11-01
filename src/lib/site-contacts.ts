// "Contact us" options the admin manages (Admin, Contact): the kinds there are, what the admin types for each, how it is checked, and where a tap on it goes.
// The database checks the same shapes (migration 0019), so a value that passes here is accepted there.

export type ContactKind = 'whatsapp' | 'email' | 'phone' | 'link';

export const CONTACT_KINDS: { value: ContactKind; label: string; labelHint: string; valueLabel: string; placeholder: string; help: string }[] = [
  {
    value: 'whatsapp', label: 'WhatsApp', labelHint: 'Chat on WhatsApp', valueLabel: 'WhatsApp number', placeholder: '91 98765 43210',
    help: 'The number with its country code (India is 91). Spaces and a + are fine. A tap opens a chat with this number.',
  },
  { value: 'email', label: 'Email', labelHint: 'Email us', valueLabel: 'Email address', placeholder: 'hello@example.org', help: 'A tap opens the phone’s email app.' },
  { value: 'phone', label: 'Phone', labelHint: 'Call us', valueLabel: 'Phone number', placeholder: '+91 98765 43210', help: 'A tap starts a call.' },
  { value: 'link', label: 'Link', labelHint: 'Follow us', valueLabel: 'Web address', placeholder: 'https://instagram.com/psalmsplayer', help: 'Any page that starts with https://, for example a social page.' },
];

export function kindLabel(kind: string): string {
  return CONTACT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

/** One row of site_contacts, as the admin edits it. */
export type SiteContact = { id: string; kind: ContactKind; label: string; value: string; sort_order: number; is_active: boolean };

export type ContactInput = { kind: ContactKind; label: string; value: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What is stored for what the admin typed: a WhatsApp number as digits only (a pasted wa.me link is read too), a phone number
 *  without spaces, everything else trimmed. */
export function normalizeContactValue(kind: ContactKind, raw: string): string {
  const text = raw.trim();
  if (kind === 'whatsapp') {
    const fromLink = /^(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\/?\?phone=)\/?(\d+)/i.exec(text);
    const digits = (fromLink ? fromLink[1] : text).replace(/[\s().-]/g, '').replace(/^\+/, '').replace(/^00/, '');
    return digits;
  }
  if (kind === 'phone') return text.replace(/[\s().-]/g, '');
  return text;
}

/** The first problem with an option, as a sentence for the admin, or null when it is fine to save. */
export function validateContact(input: ContactInput): string | null {
  const label = input.label.trim();
  if (label === '') return 'The button text is required.';
  if (label.length > 60) return 'The button text is too long (60 characters at most).';
  const value = normalizeContactValue(input.kind, input.value);
  switch (input.kind) {
    case 'whatsapp':
      if (!/^[0-9]+$/.test(value)) return 'A WhatsApp number has digits only, with the country code, for example 91 98765 43210.';
      if (value.length <= 10) return 'Add the country code in front of the number (India is 91), for example 91 98765 43210. WhatsApp chat links do not work without it.';
      if (value.length > 15) return 'That number is too long. A WhatsApp number has at most 15 digits, country code included.';
      return null;
    case 'email':
      return EMAIL_RE.test(value) && value.length <= 300 ? null : 'That does not look like an email address.';
    case 'phone':
      return /^\+?[0-9]{6,15}$/.test(value) ? null : 'A phone number has 6 to 15 digits, with an optional + in front.';
    case 'link':
      return /^https:\/\/[^\s]+$/.test(value) && value.length <= 300 ? null : 'A link must start with https:// and have no spaces.';
  }
}

/** Where a tap goes. The value must already have passed validateContact. */
export function contactHref(kind: ContactKind, value: string): string {
  switch (kind) {
    case 'whatsapp':
      return `https://wa.me/${value}`;
    case 'email':
      return `mailto:${value}`;
    case 'phone':
      return `tel:${value}`;
    case 'link':
      return value;
  }
}

/** The value as a person reads it under the button: a number with a +, an address, or a link without https://. */
export function contactDisplay(kind: ContactKind, value: string): string {
  if (kind === 'whatsapp') return `+${value}`;
  if (kind === 'link') return value.replace(/^https:\/\//, '').replace(/\/$/, '');
  return value;
}
