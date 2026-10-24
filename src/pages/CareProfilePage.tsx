import { useEffect, useId, useState } from "react";
import { Navigate } from "react-router";
import { buttonVariants } from "../components/ButtonLink";
import Highlight from "../components/Highlight";
import SiteLayout, { Blobs } from "../components/SiteLayout";
import {
  cleanAnswers,
  isAnswered,
  likelihood,
  prettyTime,
  QUESTIONS,
  type Answers,
  type Level,
  type Question,
} from "../family/careProfile";
import type { Translate } from "../i18n/translate";
import { useLanguage } from "../i18n/useLanguage";
import { useSession } from "../lib/useSession";

// The Care profile page: a few simple questions about the person being cared for
// (age, daily routine, who they live with...), one at a time, then a short summary
// of how likely a fall is and which times of day to keep an eye on.
// Only for people who are signed in. For now the answers are saved in this
// browser (one set per account), not in Supabase.

const storageKey = (userId: string) => `carenest-care-profile-${userId}`;

function loadAnswers(userId: string): Answers {
  try {
    // Old or broken saved answers are tidied up so they can't crash the page.
    return cleanAnswers(JSON.parse(localStorage.getItem(storageKey(userId)) ?? "{}"));
  } catch {
    return {};
  }
}

function saveAnswers(userId: string, answers: Answers) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(answers));
  } catch {
    // Private browsing can block saving. The page still works, it just forgets.
  }
}

const levelStyles: Record<Level, { words: string; card: string; filled: number }> = {
  lower: { words: "Lower", card: "bg-mint", filled: 1 },
  medium: { words: "Medium", card: "bg-sun", filled: 2 },
  higher: { words: "Higher", card: "bg-peach", filled: 3 },
};

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand no-underline transition-all duration-200 hover:-translate-y-0.5 hover:bg-lilac";

export default function CareProfilePage() {
  const session = useSession();
  const { t } = useLanguage();

  // Not logged in (or Supabase isn't set up): send people to the log in page.
  if (session === null) return <Navigate to="/login" replace />;
  if (session === undefined)
    return (
      <SiteLayout title="Care profile">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center justify-center px-6">
          <p className="text-xl text-muted">{t("Loading…")}</p>
        </div>
      </SiteLayout>
    );
  return <CareProfile userId={session.user.id} />;
}

function CareProfile({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const [answers, setAnswers] = useState<Answers>(() => loadAnswers(userId));
  // Which question is showing. Past the last question means "show the summary".
  const [step, setStep] = useState(() =>
    QUESTIONS.every((q) => isAnswered(q, loadAnswers(userId))) ? QUESTIONS.length : 0,
  );

  // The curly braces matter: an effect may only return a clean-up function, and
  // newer browsers make scrollTo return a Promise, which crashed the page on "Next".
  useEffect(() => {
    saveAnswers(userId, answers);
  }, [userId, answers]);

  // Bring the top of the card into view when the question changes.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  const done = step >= QUESTIONS.length;
  const name = (answers.name as string | undefined)?.trim();

  return (
    <SiteLayout title="Care profile">
      <section className="relative isolate min-h-screen px-4 pb-24 pt-6 sm:px-6">
        <Blobs fixed />
        <div className="mx-auto flex max-w-2xl flex-col gap-6">
          <div>
            <p className="inline-flex items-center rounded-full bg-surface px-4 py-2 text-base font-extrabold uppercase tracking-wide text-brand shadow-soft">
              {name ? t("About {name}", { name }) : t("About your loved one")}
            </p>
            <h1 className="mt-4 text-4xl font-extrabold md:text-5xl">
              <Highlight text={t("Care *profile*")} />
            </h1>
            <p className="mt-2 text-lg text-muted">
              {t("A few quick questions help us know when to keep a closer eye out.")}
            </p>
          </div>

          {done ? (
            <Summary
              answers={answers}
              onEdit={setStep}
              onStartAgain={() => {
                setAnswers({});
                setStep(0);
              }}
            />
          ) : (
            <QuestionCard
              key={QUESTIONS[step].id}
              question={QUESTIONS[step]}
              number={step + 1}
              answers={answers}
              onChange={(id, value) => setAnswers((old) => ({ ...old, [id]: value }))}
              onBack={step > 0 ? () => setStep(step - 1) : undefined}
              onNext={() => setStep(step + 1)}
            />
          )}
        </div>
      </section>
    </SiteLayout>
  );
}

function QuestionCard({
  question,
  number,
  answers,
  onChange,
  onBack,
  onNext,
}: {
  question: Question;
  number: number;
  answers: Answers;
  onChange: (id: string, value: string | string[]) => void;
  onBack?: () => void;
  onNext: () => void;
}) {
  const id = useId();
  const { t } = useLanguage();
  const total = QUESTIONS.length;
  const ready = isAnswered(question, answers);
  const isLast = number === total;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onNext();
      }}
      className="animate-slide-in rounded-[40px] bg-surface p-7 shadow-lift sm:p-10"
    >
      {/* How far through the questions you are. */}
      <p className="text-lg font-bold text-muted">
        {t("Question {number} of {total}", { number, total })}
      </p>
      <div
        role="progressbar"
        aria-label={t("Progress")}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={number}
        className="mt-2 h-3 w-full overflow-hidden rounded-full bg-lilac"
      >
        <div
          className="h-full rounded-full bg-brand transition-all duration-500"
          style={{ width: `${(number / total) * 100}%` }}
        />
      </div>

      <fieldset className="mt-6">
        <legend className="text-3xl font-extrabold">{t(question.title)}</legend>
        {question.hint && <p className="mt-2 text-lg text-muted">{t(question.hint)}</p>}

        <div className="mt-6 flex flex-col gap-3">
          {question.kind === "text" && (
            <input
              aria-label={t(question.title)}
              type="text"
              autoComplete="off"
              placeholder={question.placeholder && t(question.placeholder)}
              value={(answers[question.id] as string | undefined) ?? ""}
              onChange={(e) => onChange(question.id, e.target.value)}
              className="min-h-14 w-full rounded-2xl border-[3px] border-muted bg-surface px-5 text-xl text-ink transition-colors hover:border-brand focus:border-brand"
            />
          )}

          {question.kind === "times" &&
            question.fields.map((field) => (
              <label key={field.id} htmlFor={`${id}-${field.id}`} className="flex flex-col gap-2">
                <span className="text-xl font-extrabold">{t(field.label)}</span>
                <input
                  id={`${id}-${field.id}`}
                  type="time"
                  value={(answers[field.id] as string | undefined) ?? ""}
                  onChange={(e) => onChange(field.id, e.target.value)}
                  className="min-h-14 w-full rounded-2xl border-[3px] border-muted bg-surface px-5 text-xl text-ink transition-colors hover:border-brand focus:border-brand"
                />
              </label>
            ))}

          {question.kind === "choice" &&
            question.choices.map((choice) => (
              <ChoiceButton
                key={choice.value}
                type="radio"
                name={`${id}-choice`}
                label={t(choice.label)}
                checked={answers[question.id] === choice.value}
                onChange={() => onChange(question.id, choice.value)}
              />
            ))}

          {question.kind === "multi" &&
            question.choices.map((choice) => {
              const picked = (answers[question.id] as string[] | undefined) ?? [];
              const checked = picked.includes(choice.value);
              return (
                <ChoiceButton
                  key={choice.value}
                  type="checkbox"
                  name={`${id}-multi`}
                  label={t(choice.label)}
                  checked={checked}
                  onChange={() => {
                    // "Hardly ever" can't go with the other times, and the other way round.
                    let next = checked ? picked.filter((v) => v !== choice.value) : [...picked, choice.value];
                    if (!checked) next = choice.value === "never" ? ["never"] : next.filter((v) => v !== "never");
                    onChange(question.id, next);
                  }}
                />
              );
            })}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-wrap-reverse items-center justify-between gap-3">
        {onBack ? (
          <button type="button" onClick={onBack} className={buttonVariants.outline}>
            {t("Back")}
          </button>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={!ready}
          className={`${buttonVariants.primary} disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0`}
        >
          {isLast ? t("See the summary") : question.kind === "text" && !answers.name ? t("Skip") : t("Next")}
        </button>
      </div>
    </form>
  );
}

/** A big, easy-to-tap answer. Looks like a button but is a real radio or tick box. */
function ChoiceButton({
  type,
  name,
  label,
  checked,
  onChange,
}: {
  type: "radio" | "checkbox";
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-16 cursor-pointer items-center gap-4 rounded-2xl border-[3px] px-5 py-3 text-xl font-bold transition-all duration-200 hover:-translate-y-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-4 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ink ${
        checked ? "border-brand bg-lilac text-ink" : "border-lilac bg-surface text-ink hover:border-brand"
      }`}
    >
      <input type={type} name={name} checked={checked} onChange={onChange} className="sr-only" />
      <span
        aria-hidden="true"
        className={`grid h-8 w-8 shrink-0 place-items-center border-[3px] border-brand text-base ${
          type === "radio" ? "rounded-full" : "rounded-lg"
        } ${checked ? "bg-brand text-on-brand" : "bg-surface"}`}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </label>
  );
}

function Summary({
  answers,
  onEdit,
  onStartAgain,
}: {
  answers: Answers;
  onEdit: (step: number) => void;
  onStartAgain: () => void;
}) {
  const { t } = useLanguage();
  const result = likelihood(answers, t);
  const style = levelStyles[result.level];

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="chance-title" className={`animate-pop rounded-[32px] p-6 shadow-lift sm:p-8 ${style.card}`}>
        <h2 id="chance-title" className="text-xl font-extrabold">
          {t("Chance of a fall")}
        </h2>
        <p className="mt-2 text-4xl font-black sm:text-5xl">{t(style.words)}</p>
        {/* Three bars that fill up: lower, medium, higher. */}
        <div aria-hidden="true" className="mt-4 flex gap-2">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={`h-3 flex-1 origin-left rounded-full ${n <= style.filled ? "animate-grow-x bg-ink" : "bg-surface"}`}
              style={{ animationDuration: "0.6s", animationDelay: `${n * 120}ms` }}
            />
          ))}
        </div>
        {result.reasons.length > 0 ? (
          <>
            <p className="mt-6 text-xl font-extrabold">{t("Why")}</p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-6 text-lg">
              {result.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-6 text-lg">{t("Nothing in the answers points to a higher chance. That's good news!")}</p>
        )}
        <p className="mt-6 text-base">
          {t("This is a rough guide, not medical advice. If you're worried, talk to their doctor.")}
        </p>
      </section>

      {result.watchTimes.length > 0 && (
        <section aria-labelledby="watch-title" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
          <h2 id="watch-title" className="text-2xl font-extrabold">
            <Highlight text={t("Times to keep an *eye on*")} />
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {result.watchTimes.map((t) => (
              <li key={t} className="flex items-center gap-4 rounded-2xl bg-cream px-5 py-4 text-xl font-bold">
                <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full bg-brand" />
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="answers-title" className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
        <h2 id="answers-title" className="text-2xl font-extrabold">
          {t("Your answers")}
        </h2>
        <dl className="mt-4 flex flex-col divide-y-2 divide-lilac">
          {QUESTIONS.map((q, i) => (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <dt className="text-lg text-muted">{t(q.title)}</dt>
                <dd className="text-xl font-bold">{answerWords(q, answers, t)}</dd>
              </div>
              <button type="button" onClick={() => onEdit(i)} className={smallButton} aria-label={t("Change: {question}", { question: t(q.title) })}>
                {t("Change")}
              </button>
            </div>
          ))}
        </dl>
        <button type="button" onClick={onStartAgain} className={`${buttonVariants.outline} mt-6`}>
          {t("Start again")}
        </button>
      </section>
    </div>
  );
}

/** An answer in plain words for the "Your answers" list. */
function answerWords(q: Question, answers: Answers, t: Translate): string {
  if (q.kind === "text") return (answers[q.id] as string | undefined)?.trim() || t("Skipped");
  if (q.kind === "times")
    return q.fields.map((f) => `${t(f.label)} ${prettyTime(answers[f.id] as string, t)}`).join(", ");
  const picked = answers[q.id];
  const values = Array.isArray(picked) ? picked : [picked];
  return q.choices
    .filter((c) => values.includes(c.value))
    .map((c) => t(c.label))
    .join(", ");
}
