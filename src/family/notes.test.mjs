// Tests for the Family notes board's plain logic.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DONE_KEEP_DAYS,
  NOTE_MAX,
  addReactions,
  charactersLeft,
  cleanNote,
  doneCutoff,
  doneLine,
  isMissingTable,
  joinNames,
  mergeNotes,
  noteAuthor,
  noteLength,
  noteProblem,
  reactionSummary,
  removeNote,
  removeReaction,
  visibleNotes,
} from "./notes.ts";

const note = (id, minute, author = "sam", doneAt = null, doneBy = doneAt ? "sam" : null) => ({
  id,
  author_id: author,
  body: `note ${id}`,
  created_at: `2026-10-24T12:${String(minute).padStart(2, "0")}:00Z`,
  done_by: doneBy,
  done_at: doneAt,
});
const NOW = Date.parse("2026-10-24T13:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

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

test("done notes go to the bottom, each part newest first", () => {
  const done = "2026-10-24T12:30:00Z";
  const sorted = mergeNotes([], [note(1, 0), note(2, 10, "sam", done), note(3, 5), note(4, 20, "sam", done)]);
  assert.deepEqual(
    sorted.map((n) => n.id),
    [3, 1, 4, 2],
  );
  // A live update (someone ticks it) replaces the old copy.
  const ticked = mergeNotes(sorted, [note(3, 5, "sam", done)]);
  assert.deepEqual(
    ticked.map((n) => n.id),
    [1, 4, 2, 3],
  );
});

test("done notes are hidden a week after they were ticked", () => {
  const recent = note(1, 0, "sam", new Date(NOW - (DONE_KEEP_DAYS - 1) * DAY).toISOString());
  const old = note(2, 0, "sam", new Date(NOW - (DONE_KEEP_DAYS + 1) * DAY).toISOString());
  const todo = note(3, 0);
  assert.deepEqual(
    visibleNotes([recent, old, todo], NOW).map((n) => n.id),
    [1, 3],
  );
  assert.equal(doneCutoff(NOW), new Date(NOW - DONE_KEEP_DAYS * DAY).toISOString());
});

test("the done line names who ticked it", () => {
  const names = { sam: "Sam" };
  assert.equal(doneLine(note(1, 0), "me", names), "");
  assert.equal(doneLine(note(1, 0, "sam", "2026-10-24T12:30:00Z", "me"), "me", names), "Done by you");
  assert.equal(doneLine(note(1, 0, "me", "2026-10-24T12:30:00Z", "sam"), "me", names), "Done by Sam");
  assert.equal(doneLine(note(1, 0, "me", "2026-10-24T12:30:00Z", "ali"), "me", names), "Done by someone in the family");
});

test("reactions: one of each per person, toggled on and off", () => {
  const thumbs = (user) => ({ note_id: 1, user_id: user, kind: "thumbs" });
  let r = addReactions([], [thumbs("me"), thumbs("sam"), thumbs("me")]);
  assert.equal(r.length, 2);
  r = addReactions(r, [{ note_id: 1, user_id: "me", kind: "heart" }]);
  assert.equal(r.length, 3);
  assert.equal(addReactions(r, [thumbs("sam")]), r); // nothing new, same list
  r = removeReaction(r, thumbs("me"));
  assert.deepEqual(
    r.map((x) => `${x.user_id}/${x.kind}`),
    ["sam/thumbs", "me/heart"],
  );
});

test("reaction counts say who reacted, you first", () => {
  const names = { sam: "Sam", ali: "Ali" };
  const r = [
    { note_id: 1, user_id: "sam", kind: "thumbs" },
    { note_id: 1, user_id: "me", kind: "thumbs" },
    { note_id: 1, user_id: "ali", kind: "thumbs" },
    { note_id: 2, user_id: "sam", kind: "thumbs" },
  ];
  assert.deepEqual(reactionSummary(r, 1, "thumbs", "me", names), { count: 3, mine: true, who: "You, Sam and Ali" });
  assert.deepEqual(reactionSummary(r, 2, "thumbs", "me", names), { count: 1, mine: false, who: "Sam" });
  assert.deepEqual(reactionSummary(r, 1, "heart", "me", names), { count: 0, mine: false, who: "" });
  assert.equal(joinNames(["me", "zed"], "me", names), "You and Someone in the family");
});

test("a missing function counts as not switched on yet", () => {
  assert.equal(isMissingTable({ code: "PGRST202" }), true);
});
