// Tests for how "Read aloud" picks a voice and builds what it says.
//
// Run with:  npm test

import assert from "node:assert/strict";
import { test } from "node:test";
import { summarise } from "./status.ts";
import { spokenEvent, spokenStatus } from "./alerts.ts";
import { pickVoice, speechLocale, speechParts, splitSentences, spokenClock, tidyForSpeech } from "./readAloud.ts";
import { translate } from "../i18n/translate.ts";
import es from "../i18n/es.ts";
import zh from "../i18n/zh.ts";

const inEs = (text, vars) => translate(es, text, vars);
const inZh = (text, vars) => translate(zh, text, vars);
const NOW = Date.parse("2026-10-24T12:00:00Z");
// A time in the viewer's own time zone, like the page uses.
const local = (h, m) => new Date(2026, 9, 24, h, m).toISOString();
const ev = (kind, created_at, zone = "left", posture = null) => ({ id: 1, kind, zone, posture, created_at });

test("each language asks for a full voice language code", () => {
  assert.equal(speechLocale("es"), "es-ES");
  assert.equal(speechLocale("zh"), "zh-CN");
});

test("picks a voice in the chosen language, closest accent first", () => {
  const voices = [
    { name: "English", lang: "en-US", default: true },
    { name: "Mexico", lang: "es-MX" },
    { name: "Spain online", lang: "es-ES", localService: false },
    { name: "Spain", lang: "es_ES", localService: true },
    { name: "Cantonese", lang: "zh-HK" },
    { name: "Mandarin", lang: "zh-CN" },
  ];
  assert.equal(pickVoice(voices, "es").name, "Spain");
  assert.equal(pickVoice(voices, "zh").name, "Mandarin");
  assert.equal(pickVoice(voices.filter((v) => v.lang !== "zh-CN"), "zh").name, "Cantonese");
  assert.equal(pickVoice([{ lang: "es-419" }], "es").lang, "es-419");
  // Robotic character voices are listed first on Macs; the natural one wins.
  const mac = [
    { name: "Eddy (Chinese (China mainland))", lang: "zh-CN", localService: true },
    { name: "Grandma (Chinese (China mainland))", lang: "zh-CN", localService: true },
    { name: "Tingting", lang: "zh-CN", localService: true },
  ];
  assert.equal(pickVoice(mac, "zh").name, "Tingting");
  assert.equal(pickVoice(mac.slice(0, 1), "zh").name, "Eddy (Chinese (China mainland))");
});

test("no voice for the language means none, not an English one", () => {
  assert.equal(pickVoice([{ lang: "en-GB" }, { lang: "fr-FR" }], "es"), null);
  assert.equal(pickVoice([{ lang: "en-GB" }], "zh"), null);
  assert.equal(pickVoice([], "zh"), null);
});

test("times are said the way each language says them", () => {
  const page = () => "10:38 AM";
  assert.equal(spokenClock("en", page)(local(10, 38)), "10:38 AM");
  assert.equal(spokenClock("es", page)(local(9, 5)), "9:05");
  assert.equal(spokenClock("es", page)(local(14, 30)), "14:30");
  assert.equal(spokenClock("zh", page)(local(10, 38)), "10点38分");
  assert.equal(spokenClock("zh", page)(local(14, 5)), "14点05分");
  assert.equal(spokenClock("zh", page)(local(8, 0)), "8点");
});

test("Spanish read aloud is natural Spanish, sentence by sentence", () => {
  const clock = spokenClock("es", () => "unused");
  const moving = summarise([ev("moving", new Date(NOW - 60_000).toISOString())], NOW);
  const text = spokenStatus(moving, "Mamá", () => "10:38", inEs);
  assert.deepEqual(speechParts(text, "es"), ["Mamá está bien, moviéndose.", "Última actualización a las 10:38."]);
  // One o'clock is "a la 1", not "a las 1".
  assert.deepEqual(speechParts(spokenEvent(ev("fall", local(1, 5)), clock, inEs), "es"), [
    "Posible caída, lado izquierdo, a la 1:05.",
  ]);
});

test("Chinese read aloud says the time in Chinese, with no stray spaces", () => {
  const clock = spokenClock("zh", () => "unused");
  const fall = summarise([ev("fall", new Date(NOW - 60_000).toISOString())], NOW);
  const text = spokenStatus(fall, "妈妈", () => "10点38分", inZh);
  assert.deepEqual(speechParts(text, "zh"), ["手机觉得妈妈在10点38分可能跌倒了。", "请打电话或上门看看，确认他们没事。"]);
  assert.deepEqual(speechParts(spokenEvent(ev("fall", local(10, 38)), clock, inZh), "zh"), ["10点38分，可能跌倒，左边。"]);
});

test("English read aloud is unchanged", () => {
  const moving = summarise([ev("moving", new Date(NOW - 60_000).toISOString())], NOW);
  const text = spokenStatus(moving, "Mum", () => "10:38");
  assert.equal(text, "Mum is okay, moving about. Last update at 10:38.");
  assert.deepEqual(speechParts(text, "en"), ["Mum is okay, moving about.", "Last update at 10:38."]);
});

test("symbols and emoji that voices read out or trip on are removed", () => {
  assert.equal(tidyForSpeech("Grandma ❤️ 👵 is okay ✓ - moving / resting…", "en"), "Grandma is okay, moving resting.");
  assert.equal(tidyForSpeech("O'Brien * is #1", "en"), "O'Brien is 1");
  assert.equal(tidyForSpeech("¿Está bien?", "es"), "¿Está bien?");
});

test("sentences split on full stops in both scripts", () => {
  assert.deepEqual(splitSentences("One. Two! Three"), ["One.", "Two!", "Three"]);
  assert.deepEqual(splitSentences("第一句。第二句？"), ["第一句。", "第二句？"]);
  assert.deepEqual(splitSentences(""), []);
});
