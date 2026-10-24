import { english, type Translate } from "../i18n/translate.ts";

// Family notes: a small shared note board on the family page ("I'll visit Saturday").
// The plain logic lives here (no React, no Supabase) so it can be tested with `npm test`.
// The notes are shown as plain text by React, never as HTML.

/** The longest note, in characters. The database checks this too. */
export const NOTE_MAX = 280;
/** How many notes the family page keeps (newest first). */
export const NOTES_SHOWN = 50;
/** Notes ticked "Done" disappear this long after they were ticked. */
export const DONE_KEEP_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface Note {
  id: number;
  author_id: string;
  body: string;
  created_at: string;
  /** Who ticked it "Done", and when (both null while it is still to do). */
  done_by: string | null;
  done_at: string | null;
}

/** The quick reactions under each note, in the order they are shown. */
export const REACTIONS = [
  { kind: "thumbs", emoji: "👍", label: "Thumbs up" },
  { kind: "heart", emoji: "❤️", label: "Love" },
  { kind: "tick", emoji: "✅", label: "Got it" },
] as const;

export type ReactionKind = (typeof REACTIONS)[number]["kind"];

export interface Reaction {
  note_id: number;
  user_id: string;
  kind: ReactionKind;
}

/** How many characters a note has, counting an emoji or a Chinese character as one (like the database does). */
export function noteLength(text: string): number {
  return [...text].length;
}

/**
 * Tidies a note before saving: no spaces at the ends, no invisible control
 * characters, and at most one blank line in a row.
 */
export function cleanNote(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** What is wrong with a note, in plain words, or "" if it is fine to post. */
export function noteProblem(text: string): string {
  const clean = cleanNote(text);
  if (!clean) return "Please write a note first.";
  if (noteLength(clean) > NOTE_MAX) return "Please keep it to {max} characters or fewer.";
  return "";
}

/** "250 characters left", or how many too many. */
export function charactersLeft(text: string, t: Translate = english): string {
  const left = NOTE_MAX - noteLength(cleanNote(text));
  if (left >= 0) return left === 1 ? t("1 character left") : t("{n} characters left", { n: left });
  return -left === 1 ? t("1 character too many") : t("{n} characters too many", { n: -left });
}

/**
 * Adds (or updates) notes without duplicates, keeping the list short: notes still
 * to do first, then the "Done" ones, each newest first.
 */
export function mergeNotes(old: Note[], incoming: Note[], keep = NOTES_SHOWN): Note[] {
  const byId = new Map(old.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()]
    .sort(
      (a, b) =>
        Number(Boolean(a.done_at)) - Number(Boolean(b.done_at)) ||
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        b.id - a.id,
    )
    .slice(0, keep);
}

/** The oldest "Done" time still shown, for the database query. */
export function doneCutoff(now: number): string {
  return new Date(now - DONE_KEEP_DAYS * DAY_MS).toISOString();
}

/** Notes to show: everything still to do, and "Done" notes from the last week. */
export function visibleNotes(notes: Note[], now: number): Note[] {
  const cutoff = now - DONE_KEEP_DAYS * DAY_MS;
  return notes.filter((n) => !n.done_at || Date.parse(n.done_at) >= cutoff);
}

/** "Done by you" or "Done by Sam". */
export function doneLine(
  note: Pick<Note, "done_by">,
  userId: string,
  names: Record<string, string>,
  t: Translate = english,
): string {
  if (!note.done_by) return "";
  if (note.done_by === userId) return t("Done by you");
  return t("Done by {name}", { name: names[note.done_by] ?? t("someone in the family") });
}

export function removeNote(notes: Note[], id: number): Note[] {
  return notes.filter((n) => n.id !== id);
}

/** Who wrote it: "You", their name, or "Someone in the family". */
export function noteAuthor(note: Pick<Note, "author_id">, userId: string, names: Record<string, string>, t: Translate = english): string {
  if (note.author_id === userId) return t("You");
  return names[note.author_id] ?? t("Someone in the family");
}

/** Adds reactions, one of each kind per person per note. */
export function addReactions(old: Reaction[], incoming: Reaction[]): Reaction[] {
  const key = (r: Reaction) => `${r.note_id}/${r.user_id}/${r.kind}`;
  const seen = new Set(old.map(key));
  const added = incoming.filter((r) => !seen.has(key(r)) && seen.add(key(r)));
  return added.length ? [...old, ...added] : old;
}

export function removeReaction(old: Reaction[], gone: Reaction): Reaction[] {
  return old.filter((r) => !(r.note_id === gone.note_id && r.user_id === gone.user_id && r.kind === gone.kind));
}

/** "You", "Sam", "You and Sam", "You, Sam and Ali": you first, then the others. */
export function joinNames(people: string[], userId: string, names: Record<string, string>, t: Translate = english): string {
  const shown = [
    ...(people.includes(userId) ? [t("You")] : []),
    ...people.filter((p) => p !== userId).map((p) => names[p] ?? t("Someone in the family")),
  ];
  if (shown.length <= 1) return shown[0] ?? "";
  return t("{first} and {last}", { first: shown.slice(0, -1).join(", "), last: shown[shown.length - 1] });
}

/** One reaction on one note: how many, whether you're one of them, and who. */
export function reactionSummary(
  reactions: Reaction[],
  noteId: number,
  kind: ReactionKind,
  userId: string,
  names: Record<string, string>,
  t: Translate = english,
): { count: number; mine: boolean; who: string } {
  const people = reactions.filter((r) => r.note_id === noteId && r.kind === kind).map((r) => r.user_id);
  return { count: people.length, mine: people.includes(userId), who: joinNames(people, userId, names, t) };
}

/** Postgres / Supabase codes for "that table (or function) doesn't exist (yet)". */
export function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && ["42P01", "PGRST205", "PGRST200", "PGRST202", "42883"].includes(error.code ?? "");
}
