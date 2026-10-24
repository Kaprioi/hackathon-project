// Tests for daily reminders.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanLabel, cleanTime, dayKey, dueNow, minutesOf, remindersToday, spokenReminder } from "./reminders.ts";

const pills = { id: "a", kind: "medicine", label: "Heart pills", remind_at: "08:00:00" };
const lunch = { id: "b", kind: "meal", label: "Lunch", remind_at: "12:30:00" };
const at = (h, m) => new Date(2026, 9, 24, h, m);

test("typed words are tidied and kept short", () => {
  assert.equal(cleanLabel("  Heart \n pills  "), "Heart pills");
  assert.equal(cleanLabel("   "), "");
  assert.equal(cleanLabel("x".repeat(100)).length, 60);
});

test("times are read and tidied", () => {
  assert.equal(minutesOf("08:05"), 485);
  assert.equal(minutesOf("8:05:00"), 485);
  assert.equal(minutesOf("25:00"), null);
  assert.equal(minutesOf("lunch"), null);
  assert.equal(cleanTime("08:00:00"), "08:00");
  assert.equal(cleanTime("nope"), "");
});

test("the day is the phone's own date", () => {
  assert.equal(dayKey(at(0, 5)), "2026-10-24");
});

test("the phone shows a reminder for an hour from its time", () => {
  assert.deepEqual(dueNow([lunch, pills], [], {}, at(7, 59)), []);
  assert.deepEqual(dueNow([lunch, pills], [], {}, at(8, 0)), [pills]);
  assert.deepEqual(dueNow([lunch, pills], [], {}, at(8, 59)), [pills]);
  assert.deepEqual(dueNow([lunch, pills], [], {}, at(9, 0)), []);
});

test("done today or put off with Later: not shown", () => {
  const done = [{ reminder_id: "a", day: "2026-10-24", done_at: "x" }];
  assert.deepEqual(dueNow([pills], done, {}, at(8, 10)), []);
  // Done yesterday doesn't count today.
  assert.deepEqual(dueNow([pills], [{ ...done[0], day: "2026-10-23" }], {}, at(8, 10)), [pills]);
  const later = { a: at(8, 20).getTime() };
  assert.deepEqual(dueNow([pills], [], later, at(8, 10)), []);
  assert.deepEqual(dueNow([pills], [], later, at(8, 20)), [pills]);
});

test("the family page sees done, now, missed and later", () => {
  const done = [{ reminder_id: "a", day: "2026-10-24", done_at: "2026-10-24T08:02:00Z" }];
  assert.deepEqual(
    remindersToday([lunch, pills], done, at(12, 40)).map((r) => [r.reminder.id, r.state]),
    [["a", "done"], ["b", "now"]],
  );
  assert.deepEqual(
    remindersToday([lunch, pills], [], at(13, 31)).map((r) => r.state),
    ["missed", "missed"],
  );
  assert.deepEqual(
    remindersToday([lunch, pills], [], at(7, 0)).map((r) => r.state),
    ["later", "later"],
  );
});

test("what the phone says", () => {
  assert.equal(spokenReminder(pills), "Reminder: it's time for your medicine. Heart pills.");
  assert.equal(spokenReminder({ ...lunch, kind: "other", label: "Walk." }), "Reminder: Walk.");
});
