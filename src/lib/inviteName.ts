// The rules for the "Who would you invite?" box on the homepage demo. People type
// a name or who someone is to them ("Daughter", "Sam", "María José").
//
// This demo never sends anything to the database, so there is nothing for SQL
// injection to reach, and React shows typed text as plain text (never as code).
// We still only accept letters, spaces, apostrophes, hyphens and full stops, so
// odd input like "'; DROP TABLE users;--" or "<script>" is turned away with a
// friendly message. No React here, so it can be tested with `npm test`.

export const MAX_NAME_LENGTH = 30;
export const MAX_PEOPLE = 8;

export type InviteCheck = { ok: true; name: string } | { ok: false; problem: string };

// Words of letters in any language (so Spanish and Chinese names work), joined by
// one space, apostrophe, hyphen or full stop at a time, like "O'Brien", "Jean-Luc"
// or "Dr. Patel". So "admin--" or "a;b" don't fit. A name may end in a full stop ("Jr.").
const WORD = String.raw`\p{L}[\p{L}\p{M}]*`;
const ALLOWED = new RegExp(String.raw`^${WORD}(?:(?:[ '’-]|\. ?)${WORD})*\.?$`, "u");

/** Checks a typed name. The `problem` is English, ready for t(). */
export function checkInviteName(typed: string, alreadyInvited: string[]): InviteCheck {
  const name = typed.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, problem: "Please type a name first." };
  // Length first, so a long but otherwise fine name gets the right message.
  if ([...name].length > MAX_NAME_LENGTH) return { ok: false, problem: "Please keep it to 30 letters or fewer." };
  if (!ALLOWED.test(name)) return { ok: false, problem: "Please use letters only, like Daughter or Sam." };
  if (alreadyInvited.some((n) => n.toLowerCase() === name.toLowerCase()))
    return { ok: false, problem: "They're already on the list." };
  if (alreadyInvited.length >= MAX_PEOPLE) return { ok: false, problem: "That's plenty of people for this demo!" };
  return { ok: true, name };
}

/** The letter shown in someone's little circle: "daughter" -> "D", "小明" -> "小". */
export function initial(name: string): string {
  return ([...name][0] ?? "").toUpperCase();
}
