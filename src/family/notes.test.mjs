// Tests for the Family notes board's plain logic.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  NOTE_MAX,
  charactersLeft,
  cleanNote,
  isMissingTable,
  mergeNotes,
  noteAuthor,
  noteLength,
  noteProblem,
  removeNote,
} from "./notes.ts";

const note = (id, minute, author = "sam") => ({
  id,
  author_id: author,
  body: `note ${id}`,
  created_at: `2026-10-24T12:${String(minute).padStart(2, "0")}:00Z`,
});

test("notes are tidied before saving", () => {
  assert.equal(cleanNote("  I'll visit Saturday  "), "I'll visit Saturday");
  assert.equal(cleanNote("one\r\ntwo"), "one\ntwo");
  assert.equal(cleanNote("one\n\n\n\n\ntwo"), "one\n\ntwo");
  assert.equal(cleanNote("bell\u0007 here"), "bell here");
  assert.equal(cleanNote("<b>hi</b>"), "<b>hi</b>"); // kept as plain text; React never treats it as HTML
});

test("empty and too-long notes are caught", () => {
  assert.equal(noteProblem("   \n "), "Please write a note first.");
  assert.equal(noteProblem("I'll visit Saturday"), "");
  assert.equal(noteProblem("a".repeat(NOTE_MAX)), "");
  assert.equal(noteProblem("a".repeat(NOTE_MAX + 1)), "Please keep it to {max} characters or fewer.");
  // Spaces at the ends don't count.
  assert.equal(noteProblem(`  ${"a".repeat(NOTE_MAX)}  `), "");
});

test("emoji and Chinese characters count as one each, like the database", () => {
  assert.equal(noteLength("👋🏠"), 2);
  assert.equal(noteLength("周六来"), 3);
  assert.equal(noteProblem("周".repeat(NOTE_MAX)), "");
});

test("the counter uses plain words", () => {
  assert.equal(charactersLeft(""), `${NOTE_MAX} characters left`);
  assert.equal(charactersLeft("a".repeat(NOTE_MAX - 1)), "1 character left");
  assert.equal(charactersLeft("a".repeat(NOTE_MAX + 1)), "1 character too many");
  assert.equal(charactersLeft("a".repeat(NOTE_MAX + 5)), "5 characters too many");
});

test("notes are newest first, without duplicates, and can be removed", () => {
  const merged = mergeNotes([note(1, 0), note(2, 5)], [note(3, 10), note(2, 5)]);
  assert.deepEqual(
    merged.map((n) => n.id),
    [3, 2, 1],
  );
  assert.equal(mergeNotes([note(1, 0), note(2, 1), note(3, 2)], [], 2).length, 2);
  assert.deepEqual(
    removeNote(merged, 2).map((n) => n.id),
    [3, 1],
  );
  assert.deepEqual(
    removeNote(merged, 99).map((n) => n.id),
    [3, 2, 1],
  );
});

test("the author shows as You, their name, or someone in the family", () => {
  const names = { sam: "Sam" };
  assert.equal(noteAuthor(note(1, 0, "me"), "me", names), "You");
  assert.equal(noteAuthor(note(1, 0, "sam"), "me", names), "Sam");
  assert.equal(noteAuthor(note(1, 0, "ali"), "me", names), "Someone in the family");
});

test("a missing table is recognised", () => {
  assert.equal(isMissingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "42501" }), false);
  assert.equal(isMissingTable(null), false);
});
