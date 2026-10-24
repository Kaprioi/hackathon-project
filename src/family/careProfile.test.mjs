// Tests for the Care profile page's likelihood guide.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanAnswers, isAnswered, likelihood, prettyTime, QUESTIONS } from "./careProfile.ts";

test("a younger person living with someone is a lower likelihood", () => {
  const result = likelihood({ age: "under65", lives: "withSomeone", nights: "rarely", falls: "none", aid: "none", meds: "no" });
  assert.equal(result.level, "lower");
  assert.equal(result.score, 0);
  assert.deepEqual(result.reasons, []);
});

test("an older person living alone who has fallen before is a higher likelihood", () => {
  const result = likelihood({ age: "85plus", lives: "alone", nights: "often", falls: "more", aid: "walker", meds: "yes" });
  assert.equal(result.level, "higher");
  assert.equal(result.reasons.length, 6);
});

test("some risk signs make a medium likelihood", () => {
  assert.equal(likelihood({ age: "75to84", lives: "dailyVisits", nights: "once" }).level, "medium");
});

test("night-time trips and alone times show up as times to watch", () => {
  const { watchTimes } = likelihood({ wake: "07:00", bed: "22:30", nights: "once", alone: ["afternoon"] });
  assert.deepEqual(watchTimes, [
    "Overnight (10:30 pm to 7:00 am), when they get up",
    "The first hour after waking up (around 7:00 am)",
    "Getting ready for bed (around 10:30 pm)",
    "Afternoons, when they are on their own",
  ]);
});

test("times read the way people say them", () => {
  assert.equal(prettyTime("00:15"), "12:15 am");
  assert.equal(prettyTime("12:00"), "12:00 pm");
  assert.equal(prettyTime("09:05"), "9:05 am");
});

test("the name is optional but the other questions need an answer", () => {
  const byId = Object.fromEntries(QUESTIONS.map((q) => [q.id, q]));
  assert.equal(isAnswered(byId.name, {}), true);
  assert.equal(isAnswered(byId.age, {}), false);
  assert.equal(isAnswered(byId.schedule, { wake: "07:00" }), false);
  assert.equal(isAnswered(byId.schedule, { wake: "07:00", bed: "22:00" }), true);
  assert.equal(isAnswered(byId.alone, { alone: [] }), false);
});

test("broken times don't show up as nonsense", () => {
  assert.equal(prettyTime("7"), "");
  assert.equal(prettyTime("abc"), "");
  assert.equal(prettyTime("07:30:00"), "7:30 am");
});

test("broken or old saved answers are tidied up instead of crashing the page", () => {
  // Things that aren't a set of answers at all.
  for (const saved of [null, undefined, "hello", 5, [1, 2]]) assert.deepEqual(cleanAnswers(saved), {});
  // Wrong kinds of value and choices that don't exist are dropped.
  assert.deepEqual(
    cleanAnswers({ name: 5, age: "100plus", lives: "alone", wake: "7", bed: "22:00", alone: "morning", other: "x" }),
    { lives: "alone", bed: "22:00" },
  );
  // Lists keep only real choices, and "Hardly ever" can't go with the other times.
  assert.deepEqual(cleanAnswers({ alone: ["evening", "teatime", 3, "morning"] }), { alone: ["morning", "evening"] });
  assert.deepEqual(cleanAnswers({ alone: ["morning", "never"] }), { alone: ["never"] });
  assert.deepEqual(cleanAnswers({ alone: [] }), {});
});

test("good saved answers come back unchanged", () => {
  const saved = { name: "Mum", age: "85plus", lives: "alone", wake: "07:00", bed: "22:30", alone: ["morning"], nights: "once", falls: "none", aid: "stick", meds: "no" };
  assert.deepEqual(cleanAnswers(saved), saved);
  assert.ok(QUESTIONS.every((q) => isAnswered(q, cleanAnswers(saved))));
});
