import { useId, useState } from "react";
import {
  charactersLeft,
  cleanNote,
  doneLine,
  NOTE_MAX,
  noteAuthor,
  noteLength,
  noteProblem,
  reactionSummary,
  REACTIONS,
  visibleNotes,
} from "../family/notes";
import { timeAgo } from "../family/status";
import { useFamilyNotes } from "../family/useFamilyNotes";
import { useLanguage } from "../i18n/useLanguage";
import { buttonVariants } from "./ButtonLink";
import Highlight from "./Highlight";

// The "Family notes" card on the family page: a small shared note board so the
// family can coordinate ("I'll visit Saturday"). Everyone in the care circle can
// post and read, tick a note "Done" and leave a quick reaction; you can delete
// your own notes. Notes show as plain text.

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand transition-colors hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-70";

export default function FamilyNotes({ circleId, userId, now }: { circleId: string; userId: string; now: number }) {
  const id = useId();
  const { t } = useLanguage();
  const { notes, reactions, names, state, posting, busy, message, post, remove, setDone, toggleReaction } =
    useFamilyNotes(circleId, userId);
  const shown = visibleNotes(notes, now);
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState("");
  const tooLong = noteLength(cleanNote(draft)) > NOTE_MAX;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const wrong = noteProblem(draft);
    setProblem(wrong);
    if (wrong) return;
    if (await post(draft)) setDraft("");
  }

  function confirmDelete(noteId: number) {
    if (window.confirm(t("Delete this note? Everyone in the family will stop seeing it."))) remove(noteId);
  }

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-[32px] bg-surface p-6 shadow-soft sm:p-8">
      <h2 id={`${id}-title`} className="text-2xl font-extrabold">
        <Highlight text={t("Family *notes*")} />
      </h2>
      <p className="mt-2 text-lg text-muted">
        {t('A shared note board for the family, like "I\'ll visit Saturday". Everyone in the family can see it.')}
      </p>

      {state === "missing" ? (
        <p className="mt-4 text-xl font-bold">
          {t(
            "Family notes aren't switched on yet. (Whoever set up CareNest needs to run the newest database update.)",
          )}
        </p>
      ) : (
        <>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-2" noValidate>
            <label htmlFor={`${id}-note`} className="text-xl font-extrabold">
              {t("Write a note for the family")}
            </label>
            <textarea
              id={`${id}-note`}
              rows={3}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (problem) setProblem("");
              }}
              aria-describedby={`${id}-count`}
              aria-invalid={tooLong || Boolean(problem)}
              placeholder={t("For example: I'll visit on Saturday morning")}
              className="w-full rounded-2xl border-[3px] border-muted bg-surface px-5 py-3 text-xl text-ink transition-colors hover:border-brand focus:border-brand"
            />
            <p id={`${id}-count`} className={`text-base font-bold ${tooLong ? "text-error" : "text-muted"}`}>
              {charactersLeft(draft, t)}
            </p>
            {problem && (
              <p role="alert" className="text-lg font-bold text-error">
                {t(problem, { max: NOTE_MAX })}
              </p>
            )}
            <button
              type="submit"
              disabled={posting}
              className={`${buttonVariants.primary} mt-1 self-start text-xl disabled:opacity-70`}
            >
              {posting ? t("Posting…") : t("Post note")}
            </button>
          </form>

          {message && (
            <p role="alert" className="mt-4 text-lg font-bold text-error">
              {t(message)}
            </p>
          )}

          <div className="mt-6">
            {state === "loading" ? (
              <p className="text-xl text-muted">{t("Loading notes…")}</p>
            ) : state === "error" ? (
              <p role="alert" className="text-xl font-bold text-error">
                {t("We couldn't load the family notes. Please reload the page.")}
              </p>
            ) : shown.length === 0 ? (
              <p className="text-xl text-muted">{t("No notes yet. Be the first to write one!")}</p>
            ) : (
              <ul aria-label={t("Notes, newest first")} className="flex flex-col gap-3">
                {shown.map((note) => {
                  const mine = note.author_id === userId;
                  const done = doneLine(note, userId, names, t);
                  const when = timeAgo(note.created_at, now, t);
                  const people = REACTIONS.map((r) => ({ ...r, ...reactionSummary(reactions, note.id, r.kind, userId, names, t) }));
                  return (
                    <li
                      key={note.id}
                      className={`rounded-2xl px-5 py-4 ${done ? "border-[3px] border-dashed border-muted bg-surface" : "bg-cream shadow-soft"}`}
                    >
                      <p className="flex flex-wrap items-baseline gap-x-3 text-lg">
                        <strong className="font-extrabold text-ink">{noteAuthor(note, userId, names, t)}</strong>
                        <time dateTime={note.created_at} title={new Date(note.created_at).toLocaleString()} className="font-bold text-muted">
                          {when}
                        </time>
                      </p>
                      {/* Plain text: React shows it as written, never as HTML. */}
                      <p className={`mt-1 whitespace-pre-wrap break-words text-xl ${done ? "text-muted" : "text-ink"}`}>{note.body}</p>
                      {done && (
                        <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-mint px-3 py-1 text-lg font-extrabold text-ink">
                          <span aria-hidden="true">✓</span>
                          {done}
                        </p>
                      )}

                      {/* Quick reactions: tap to add yours, tap again to take it back. */}
                      <div role="group" aria-label={t("Reactions")} className="mt-3 flex flex-wrap gap-2">
                        {people.map((r) => (
                          <button
                            key={r.kind}
                            type="button"
                            onClick={() => toggleReaction(note.id, r.kind)}
                            aria-pressed={r.mine}
                            aria-label={
                              r.count
                                ? t("{reaction}: {count}, from {who}", { reaction: t(r.label), count: r.count, who: r.who })
                                : t(r.label)
                            }
                            title={r.count ? r.who : t(r.label)}
                            className={`inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-2xl border-[3px] px-3 text-lg font-extrabold transition-colors hover:bg-lilac ${r.mine ? "border-brand bg-lilac text-brand" : "border-muted bg-surface text-ink"}`}
                          >
                            <span aria-hidden="true">{r.emoji}</span>
                            {r.count > 0 && <span aria-hidden="true">{r.count}</span>}
                          </button>
                        ))}
                      </div>
                      {/* Who reacted, written out so it works without hovering (phones, screen readers). */}
                      {people.some((r) => r.count > 0) && (
                        <p className="mt-2 text-base font-bold text-muted">
                          {people
                            .filter((r) => r.count > 0)
                            .map((r) => `${r.emoji} ${r.who}`)
                            .join("  ·  ")}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-3">
                        {!note.done_by ? (
                          <button
                            type="button"
                            onClick={() => setDone(note.id, true)}
                            disabled={busy === note.id}
                            aria-label={t("Mark as done: the note from {when}", { when })}
                            className={smallButton}
                          >
                            {t("Mark as done")}
                          </button>
                        ) : (
                          note.done_by === userId && (
                            <button
                              type="button"
                              onClick={() => setDone(note.id, false)}
                              disabled={busy === note.id}
                              aria-label={t("Undo done: the note from {when}", { when })}
                              className={smallButton}
                            >
                              {t("Undo done")}
                            </button>
                          )
                        )}
                        {mine && (
                          <button
                            type="button"
                            onClick={() => confirmDelete(note.id)}
                            disabled={busy === note.id}
                            aria-label={t("Delete your note from {when}", { when })}
                            className={smallButton}
                          >
                            {busy === note.id ? t("Please wait…") : t("Delete")}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
