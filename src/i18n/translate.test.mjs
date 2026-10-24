// Tests for the language helpers and the Spanish and Chinese word lists.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkingLine, spokenStatus } from "../family/alerts.ts";
import { describe, summarise, timeAgo } from "../family/status.ts";
import { likelihood } from "../family/careProfile.ts";
import { summariseDay } from "../family/dailySummary.ts";
import es from "./es.ts";
import { fill, pickLanguage, splitHighlight, translate } from "./translate.ts";
import zh from "./zh.ts";

test("gaps are filled in, and unknown gaps are left alone", () => {
  assert.equal(fill("Sent to {email}.", { email: "ann@example.com" }), "Sent to ann@example.com.");
  assert.equal(fill("{n} minutes ago", { n: 5 }), "5 minutes ago");
  assert.equal(fill("Hello {name}"), "Hello {name}");
  assert.equal(fill("Hello {name}", {}), "Hello {name}");
});

test("text missing from a word list shows in English", () => {
  assert.equal(translate(es, "Log out"), "Cerrar sesión");
  assert.equal(translate(es, "Some brand new sentence"), "Some brand new sentence");
  assert.equal(translate(undefined, "Step {n}", { n: 2 }), "Step 2");
  assert.equal(translate(zh, "Step {n}", { n: 2 }), "第 2 步");
});

test("the starting language comes from this browser's choice, then its languages", () => {
  assert.equal(pickLanguage("zh", ["es-MX"]), "zh");
  assert.equal(pickLanguage(null, ["es-MX", "en"]), "es");
  assert.equal(pickLanguage(null, ["fr-FR", "zh-CN"]), "zh");
  assert.equal(pickLanguage(null, ["fr-FR", "de"]), "en");
  assert.equal(pickLanguage("klingon", []), "en");
  assert.equal(pickLanguage(undefined, ["EN-gb"]), "en");
});

test("starred words in a heading are picked out", () => {
  assert.deepEqual(splitHighlight("How it *works*"), [
    { text: "How it ", highlighted: false },
    { text: "works", highlighted: true },
  ]);
  assert.deepEqual(splitHighlight("*即使相隔很远*，也能"), [
    { text: "即使相隔很远", highlighted: true },
    { text: "，也能", highlighted: false },
  ]);
  assert.deepEqual(splitHighlight("No stars"), [{ text: "No stars", highlighted: false }]);
});

const gaps = (text) => [...new Set(text.match(/\{\w+\}/g) ?? [])].sort();
const stars = (text) => (text.match(/\*/g) ?? []).length;

for (const [name, words] of [
  ["Spanish", es],
  ["Chinese", zh],
]) {
  test(`every ${name} line keeps the same {gaps} and *stars* as the English`, () => {
    for (const [english, translated] of Object.entries(words)) {
      assert.ok(translated.trim(), `empty translation for "${english}"`);
      // Clock times may use {h24} (the 24-hour clock) in place of {h}.
      const used = gaps(translated).map((g) => (g === "{h24}" && english.includes("{h}:{m}") ? "{h}" : g));
      assert.deepEqual(used, gaps(english), `gaps differ for "${english}"`);
      assert.equal(stars(translated), stars(english), `stars differ for "${english}"`);
    }
  });
}

test("Spanish and Chinese translate the same English lines", () => {
  assert.deepEqual(Object.keys(es).sort(), Object.keys(zh).sort());
});

test("the family page status reads naturally in each language", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const event = { id: 1, kind: "moving", zone: "left", posture: "standing", created_at: "2026-10-24T11:58:00Z" };
  const inEs = (text, vars) => translate(es, text, vars);
  const inZh = (text, vars) => translate(zh, text, vars);
  assert.equal(describe(event, now), "Moving around - left side - 2 minutes ago");
  assert.equal(describe(event, now, inEs), "Moviéndose - lado izquierdo - hace 2 minutos");
  assert.equal(describe(event, now, inZh), "正在走动 - 左边 - 2 分钟前");
  assert.equal(timeAgo("2026-10-24T11:00:00Z", now, inZh), "1 小时前");
});

test("the Care profile summary is translated, English stays the same", () => {
  const answers = { age: "85plus", nights: "often", wake: "07:30", bed: "22:00", alone: ["morning"] };
  assert.deepEqual(likelihood(answers).watchTimes, [
    "Overnight (10:00 pm to 7:30 am), when they get up",
    "The first hour after waking up (around 7:30 am)",
    "Getting ready for bed (around 10:00 pm)",
    "Mornings, when they are on their own",
  ]);
  const inZh = likelihood(answers, (text, vars) => translate(zh, text, vars));
  assert.equal(inZh.watchTimes[0], "夜里（22:00到7:30），他们起床时");
  assert.equal(inZh.reasons[0], "85 岁以后最容易跌倒。");
});

test("the family page's day summary is translated, and the fall line is marked", () => {
  const day = Date.parse("2026-10-24T00:00:00Z");
  const ev = (id, kind, hhmm) => ({ id, kind, zone: "left", posture: null, created_at: `2026-10-24T${hhmm}:00Z` });
  const events = [ev(1, "moving", "07:40"), ev(2, "moving", "08:15"), ev(3, "fall", "09:30")];
  const opts = { dayStart: day, timeOf: (ms) => new Date(ms).toISOString().slice(11, 16), hourOf: (ms) => new Date(ms).getUTCHours() };
  const inEs = summariseDay(events, Date.parse("2026-10-24T12:00:00Z"), { ...opts, t: (text, vars) => translate(es, text, vars) });
  assert.deepEqual(inEs.lines, [
    "En movimiento desde las 07:40.",
    "Más activo por la mañana.",
    "Una posible caída, a las 09:30. Compruebe que está bien, por favor.",
    "Sin movimiento desde las 09:30.",
  ]);
  assert.equal(inEs.fallLine, inEs.lines[2]);
});

test("read aloud and 'checking on it' speak the chosen language", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const inEs = (text, vars) => translate(es, text, vars);
  const summary = summarise([{ id: 1, kind: "moving", zone: "left", posture: null, created_at: "2026-10-24T11:59:00Z" }], now);
  assert.equal(spokenStatus(summary, "Mamá", () => "10:38", inEs), "Mamá está bien, moviéndose. Última actualización a las 10:38.");
  assert.equal(checkingLine(["You"], inEs), "Usted lo está comprobando");
  assert.equal(checkingLine(["You", "Sam"], inEs), "Usted y Sam lo están comprobando");
  assert.equal(checkingLine(["Sam", "Ali", "Jo"]), "Sam, Ali and Jo are checking on it");
});
