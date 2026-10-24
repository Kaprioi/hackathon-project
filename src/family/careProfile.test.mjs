// Tests for the Care profile page's likelihood guide.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { isAnswered, likelihood, prettyTime, QUESTIONS } from "./careProfile.ts";

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
