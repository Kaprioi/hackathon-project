// The phone numbers behind the family page's big "Call" buttons. Saved in this
// browser (one set per account), not in Supabase.
// No React here, so it can be tested with `npm test`.

export interface Contact {
  name: string;
  phone: string;
}

export interface Contacts {
  /** The person being cared for. */
  person?: Contact;
  /** Someone to call in an emergency (a neighbour, a relative, a doctor...). */
  emergency?: Contact;
}

/**
 * Tidies a typed phone number: keeps the digits and a leading "+", drops spaces,
 * dashes and brackets. Returns "" when it doesn't look like a phone number.
 */
export function cleanPhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 15) return "";
  if (/[^\d\s()+.-]/.test(trimmed)) return "";
  return (trimmed.startsWith("+") ? "+" : "") + digits;
}

/** The link that starts a phone call, e.g. "tel:+447700900123". */
export function telHref(phone: string): string {
  return `tel:${cleanPhone(phone)}`;
}

function cleanContact(raw: unknown): Contact | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const { name, phone } = raw as Record<string, unknown>;
  if (typeof phone !== "string" || !cleanPhone(phone)) return undefined;
  return { name: typeof name === "string" ? name.trim().slice(0, 60) : "", phone: cleanPhone(phone) };
}

/** Keep only saved numbers that still make sense, so broken data can't crash the page. */
export function cleanContacts(saved: unknown): Contacts {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const raw = saved as Record<string, unknown>;
  const contacts: Contacts = {};
  const person = cleanContact(raw.person);
  const emergency = cleanContact(raw.emergency);
  if (person) contacts.person = person;
  if (emergency) contacts.emergency = emergency;
  return contacts;
}
