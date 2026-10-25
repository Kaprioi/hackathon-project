// Tests for the home's name on the family page.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanHomeName, shownHomeName } from "./homeName.ts";

test("typed names are tidied and kept short", () => {
  assert.equal(cleanHomeName("  Grandma's \n home "), "Grandma's home");
  assert.equal(cleanHomeName("   "), "");
  assert.equal(cleanHomeName("x".repeat(80)).length, 40);
});

test("the default name is shown in the reader's language", () => {
  const t = (s) => (s === "My care circle" ? "Mi círculo de cuidado" : s);
  assert.equal(shownHomeName("My care circle", t), "Mi círculo de cuidado");
  assert.equal(shownHomeName("Grandma's home", t), "Grandma's home");
});
