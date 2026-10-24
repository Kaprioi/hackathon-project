// Tests for where people go after signing in.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { afterSignIn, safeNext } from "./guide.ts";

test("new people see the setup guide, people who finished it see the family page", () => {
  assert.equal(afterSignIn(null, false), "/get-started");
  assert.equal(afterSignIn(null, true), "/dashboard");
});

test("a page asked for with ?next= comes first", () => {
  assert.equal(afterSignIn("/tracker", false), "/tracker");
  assert.equal(afterSignIn("/profile", true), "/profile");
});

test("?next= can't send people to another website", () => {
  for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "/\t/evil.com", "/\n/evil.com", "/\r//evil.com", "/ /evil.com", "/a\\b", "evil.com", "", null, undefined])
    assert.equal(safeNext(bad), null);
  assert.equal(afterSignIn("https://evil.com", false), "/get-started");
});
