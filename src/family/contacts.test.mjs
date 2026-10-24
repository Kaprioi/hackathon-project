// Tests for the family page's "Call" numbers.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanContacts, cleanPhone, telHref } from "./contacts.ts";

test("phone numbers are tidied up for calling", () => {
  assert.equal(cleanPhone("+44 7700 900-123"), "+447700900123");
  assert.equal(cleanPhone("(020) 7946 0018"), "02079460018");
  assert.equal(telHref("07700 900123"), "tel:07700900123");
});

test("things that aren't phone numbers are refused", () => {
  assert.equal(cleanPhone(""), "");
  assert.equal(cleanPhone("call me"), "");
  assert.equal(cleanPhone("12"), "");
  assert.equal(cleanPhone("javascript:alert(1)"), "");
});

test("broken saved numbers can't crash the page", () => {
  assert.deepEqual(cleanContacts(null), {});
  assert.deepEqual(cleanContacts([1, 2]), {});
  assert.deepEqual(cleanContacts({ person: { name: 5, phone: "999" }, emergency: { phone: "nope" } }), {
    person: { name: "", phone: "999" },
  });
});
