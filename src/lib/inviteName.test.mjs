// Tests for the "Who would you invite?" box on the homepage demo.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInviteName, initial } from "./inviteName.ts";

test("ordinary names and relationships are accepted, tidied up", () => {
  assert.deepEqual(checkInviteName("  Daughter ", []), { ok: true, name: "Daughter" });
  assert.deepEqual(checkInviteName("Mary   Ann", []), { ok: true, name: "Mary Ann" });
  for (const name of ["O'Brien", "Jean-Luc", "Dr. Patel", "María José", "小明", "Nana’s carer"])
    assert.equal(checkInviteName(name, []).ok, true, name);
});

test("database commands, code and symbols are turned away", () => {
  for (const bad of [
    "'; DROP TABLE users;--",
    "Robert'); DROP TABLE students;--",
    "1 OR 1=1",
    "\" OR \"\"=\"",
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "admin--",
    "name; DELETE FROM profiles",
    "a\u0000b",
    "😀",
    "'quoted",
  ])
  {
    const result = checkInviteName(bad, []);
    assert.equal(result.ok, false, bad);
    // Short ones are told to use letters; long ones are told they're too long.
    if ([...bad].length <= 30) assert.equal(result.problem, "Please use letters only, like Daughter or Sam.", bad);
  }
});

test("empty, too long, repeated and too many are explained", () => {
  assert.equal(checkInviteName("   ", []).problem, "Please type a name first.");
  assert.equal(checkInviteName("a".repeat(31), []).problem, "Please keep it to 30 letters or fewer.");
  assert.equal(checkInviteName("a".repeat(30), []).ok, true);
  assert.equal(checkInviteName("daughter", ["Daughter"]).problem, "They're already on the list.");
  assert.equal(checkInviteName("Sam", ["A", "B", "C", "D", "E", "F", "G", "H"]).problem, "That's plenty of people for this demo!");
});

test("the circle shows a capital first letter, in any language", () => {
  assert.equal(initial("daughter"), "D");
  assert.equal(initial("小明"), "小");
  assert.equal(initial("élodie"), "É");
});
