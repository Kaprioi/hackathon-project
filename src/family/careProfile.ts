// The questions on the Care profile page (/profile) and how the answers turn into
// a rough "how likely is a fall" guide plus the times of day to keep an eye on.
// Loosely based on common fall-risk signs (age, past falls, walking aids, living
// alone, getting up at night, lots of medicines). A rough guide, not medical advice.
// No React here, so it can be tested with `npm test`.

export interface Choice {
  value: string;
  label: string;
  /** How much this answer adds to the likelihood score. */
  points?: number;
  /** Shown under "Why" on the summary when this answer adds points. */
  reason?: string;
}

export type Question =
  | { id: string; kind: "text"; title: string; hint?: string; placeholder?: string }
  | { id: string; kind: "choice"; title: string; hint?: string; choices: Choice[] }
  | { id: string; kind: "multi"; title: string; hint?: string; choices: Choice[] }
  | { id: string; kind: "times"; title: string; hint?: string; fields: { id: string; label: string }[] };

/** Answers by question (or time field) id. Multi-choice answers are lists. */
export type Answers = Record<string, string | string[] | undefined>;

export const QUESTIONS: Question[] = [
  {
    id: "name",
    kind: "text",
    title: "What do you call them?",
    hint: "Just so the page feels personal. You can skip this.",
    placeholder: "For example: Mum, Grandpa Joe",
  },
  {
    id: "age",
    kind: "choice",
    title: "How old are they?",
    choices: [
      { value: "under65", label: "Under 65" },
      { value: "65to74", label: "65 to 74", points: 1, reason: "Falls get more common after 65." },
      { value: "75to84", label: "75 to 84", points: 2, reason: "Falls get more common with age, especially after 75." },
      { value: "85plus", label: "85 or older", points: 3, reason: "Falls are most common after 85." },
    ],
  },
  {
    id: "lives",
    kind: "choice",
    title: "Who do they live with?",
    choices: [
      { value: "withSomeone", label: "Someone lives with them" },
      { value: "dailyVisits", label: "They live alone, but someone visits every day", points: 1, reason: "They are on their own for parts of the day." },
      { value: "alone", label: "They live alone", points: 2, reason: "They live alone, so a fall might not be noticed quickly." },
    ],
  },
  {
    id: "schedule",
    kind: "times",
    title: "When do they usually wake up and go to bed?",
    hint: "A rough guess is fine.",
    fields: [
      { id: "wake", label: "Wakes up around" },
      { id: "bed", label: "Goes to bed around" },
    ],
  },
  {
    id: "alone",
    kind: "multi",
    title: "When are they usually on their own at home?",
    hint: "Pick all that apply.",
    choices: [
      { value: "morning", label: "Mornings" },
      { value: "afternoon", label: "Afternoons" },
      { value: "evening", label: "Evenings" },
      { value: "night", label: "Overnight" },
      { value: "never", label: "Hardly ever" },
    ],
  },
  {
    id: "nights",
    kind: "choice",
    title: "How often do they get up in the night?",
    hint: "For example, to use the bathroom.",
    choices: [
      { value: "rarely", label: "Rarely or never" },
      { value: "once", label: "About once a night", points: 1, reason: "They get up in the night, when it is dark and they are sleepy." },
      { value: "often", label: "Two or more times a night", points: 2, reason: "They get up several times a night, when it is dark and they are sleepy." },
    ],
  },
  {
    id: "falls",
    kind: "choice",
    title: "Have they fallen in the past year?",
    choices: [
      { value: "none", label: "No" },
      { value: "once", label: "Once", points: 2, reason: "They have fallen in the past year." },
      { value: "more", label: "More than once", points: 3, reason: "They have fallen more than once in the past year." },
    ],
  },
  {
    id: "aid",
    kind: "choice",
    title: "Do they use anything to help them walk?",
    choices: [
      { value: "none", label: "No, nothing" },
      { value: "stick", label: "A walking stick", points: 1, reason: "They use a walking stick." },
      { value: "walker", label: "A walking frame", points: 2, reason: "They use a walking frame." },
      { value: "wheelchair", label: "A wheelchair", points: 1, reason: "Getting in and out of a wheelchair can lead to falls." },
    ],
  },
  {
    id: "meds",
    kind: "choice",
    title: "Do they take 4 or more different medicines a day?",
    hint: "Some medicines can cause dizziness.",
    choices: [
      { value: "no", label: "No" },
      { value: "notSure", label: "Not sure" },
      { value: "yes", label: "Yes", points: 1, reason: "Taking several medicines can cause dizziness." },
    ],
  },
];

const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Keep only answers the questions understand. Saved answers can be broken or
 * from an older version of the page (not a list, a choice that no longer
 * exists...), and showing those would crash the page.
 */
export function cleanAnswers(saved: unknown): Answers {
  const answers: Answers = {};
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return answers;
  const raw = saved as Record<string, unknown>;
  for (const q of QUESTIONS) {
    if (q.kind === "text") {
      if (typeof raw[q.id] === "string") answers[q.id] = raw[q.id] as string;
    } else if (q.kind === "times") {
      for (const f of q.fields) {
        const t = raw[f.id];
        if (typeof t === "string" && TIME.test(t)) answers[f.id] = t;
      }
    } else if (q.kind === "choice") {
      if (q.choices.some((c) => c.value === raw[q.id])) answers[q.id] = raw[q.id] as string;
    } else {
      const list = Array.isArray(raw[q.id]) ? (raw[q.id] as unknown[]) : [];
      const picked = q.choices.map((c) => c.value).filter((v) => list.includes(v));
      if (picked.length > 0) answers[q.id] = picked.includes("never") ? ["never"] : picked;
    }
  }
  return answers;
}

/** Has this question been answered enough to move on? (The name is optional.) */
export function isAnswered(q: Question, answers: Answers): boolean {
  if (q.kind === "text") return true;
  if (q.kind === "times") return q.fields.every((f) => Boolean(answers[f.id]));
  const a = answers[q.id];
  return Array.isArray(a) ? a.length > 0 : Boolean(a);
}

export type Level = "lower" | "medium" | "higher";

export interface Likelihood {
  level: Level;
  score: number;
  reasons: string[];
  /** Times of day worth keeping an eye on, in plain words. */
  watchTimes: string[];
}

/** "07:30" -> "7:30 am". */
export function prettyTime(hhmm: string | undefined): string {
  if (!hhmm || !TIME.test(hhmm)) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function likelihood(answers: Answers): Likelihood {
  let score = 0;
  const reasons: string[] = [];
  for (const q of QUESTIONS) {
    if (q.kind !== "choice") continue;
    const picked = q.choices.find((c) => c.value === answers[q.id]);
    if (picked?.points) {
      score += picked.points;
      if (picked.reason) reasons.push(picked.reason);
    }
  }

  const level: Level = score >= 8 ? "higher" : score >= 4 ? "medium" : "lower";

  const watchTimes: string[] = [];
  const wake = prettyTime(answers.wake as string | undefined);
  const bed = prettyTime(answers.bed as string | undefined);
  const alone = (answers.alone as string[] | undefined) ?? [];
  if (answers.nights === "once" || answers.nights === "often")
    watchTimes.push(bed && wake ? `Overnight (${bed} to ${wake}), when they get up` : "Overnight, when they get up");
  if (wake) watchTimes.push(`The first hour after waking up (around ${wake})`);
  if (bed) watchTimes.push(`Getting ready for bed (around ${bed})`);
  const aloneWords: Record<string, string> = {
    morning: "Mornings, when they are on their own",
    afternoon: "Afternoons, when they are on their own",
    evening: "Evenings, when they are on their own",
  };
  for (const part of alone) if (aloneWords[part]) watchTimes.push(aloneWords[part]);

  return { level, score, reasons, watchTimes };
}
