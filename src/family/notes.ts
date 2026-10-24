import { english, type Translate } from "../i18n/translate.ts";

// Family notes: a small shared note board on the family page ("I'll visit Saturday").
// The plain logic lives here (no React, no Supabase) so it can be tested with `npm test`.
// The notes are shown as plain text by React, never as HTML.

/** The longest note, in characters. The database checks this too. */
export const NOTE_MAX = 280;
/** How many notes the family page keeps (newest first). */
export const NOTES_SHOWN = 50;

export interface Note {
  id: number;
  author_id: string;
  body: string;
  created_at: string;
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

/** Adds notes without duplicates, newest first, keeping the list short. */
export function mergeNotes(old: Note[], incoming: Note[], keep = NOTES_SHOWN): Note[] {
  const byId = new Map(old.map((n) => [n.id, n]));
  for (const n of incoming) byId.set(n.id, n);
  return [...byId.values()]
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id)
    .slice(0, keep);
}

export function removeNote(notes: Note[], id: number): Note[] {
  return notes.filter((n) => n.id !== id);
}

/** Who wrote it: "You", their name, or "Someone in the family". */
export function noteAuthor(note: Pick<Note, "author_id">, userId: string, names: Record<string, string>, t: Translate = english): string {
  if (note.author_id === userId) return t("You");
  return names[note.author_id] ?? t("Someone in the family");
}

/** Postgres / Supabase codes for "that table doesn't exist (yet)". */
export function isMissingTable(error: { code?: string } | null): boolean {
  return !!error && ["42P01", "PGRST205", "PGRST200"].includes(error.code ?? "");
}
