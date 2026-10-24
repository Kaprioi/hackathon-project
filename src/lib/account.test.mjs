// Tests for the Your account page's checks.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import es from "../i18n/es.ts";
import { translate } from "../i18n/translate.ts";
import { cleanDisplayName, displayNameProblem, MAX_NAME_LENGTH, passwordProblems } from "./account.ts";

test("display names lose extra spaces", () => {
  assert.equal(cleanDisplayName("  Grandma   Rose  "), "Grandma Rose");
});

test("an empty or too-long display name has a problem", () => {
  assert.notEqual(displayNameProblem("   "), "");
  assert.notEqual(displayNameProblem("a".repeat(MAX_NAME_LENGTH + 1)), "");
  assert.equal(displayNameProblem("Sam"), "");
});

test("password checks point at the right box", () => {
  assert.ok(passwordProblems("", "newpass", "newpass").current);
  assert.ok(passwordProblems("old123", "", "").next);
  assert.ok(passwordProblems("old123", "abc", "abc").next);
  assert.ok(passwordProblems("old123", "old123", "old123").next);
  assert.ok(passwordProblems("old123", "newpass", "newpas").again);
  assert.deepEqual(passwordProblems("old123", "newpass", "newpass"), {});
});

test("the name problems can be shown in another language", () => {
  const inEs = (text, vars) => translate(es, text, vars);
  assert.equal(displayNameProblem("a".repeat(MAX_NAME_LENGTH + 1), inEs), `Su nombre debe tener menos de ${MAX_NAME_LENGTH} letras, por favor.`);
  assert.equal(displayNameProblem("a".repeat(MAX_NAME_LENGTH + 1)), `Please keep your name under ${MAX_NAME_LENGTH} letters.`);
});
