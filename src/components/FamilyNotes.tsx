import { useId, useState } from "react";
import { charactersLeft, NOTE_MAX, noteAuthor, noteLength, noteProblem, cleanNote } from "../family/notes";
import { timeAgo } from "../family/status";
import { useFamilyNotes } from "../family/useFamilyNotes";
import { useLanguage } from "../i18n/useLanguage";
import { buttonVariants } from "./ButtonLink";
import Highlight from "./Highlight";

// The "Family notes" card on the family page: a small shared note board so the
// family can coordinate ("I'll visit Saturday"). Everyone in the care circle can
// post and read; you can delete your own notes. Notes show as plain text.

const smallButton =
  "inline-flex min-h-12 items-center justify-center rounded-2xl border-[3px] border-brand bg-surface px-5 text-lg font-extrabold text-brand transition-colors hover:bg-lilac disabled:cursor-not-allowed disabled:opacity-70";

export default function FamilyNotes({ circleId, userId, now }: { circleId: string; userId: string; now: number }) {
  const id = useId();
  const { t } = useLanguage();
  const { notes, names, state, posting, deleting, message, post, remove } = useFamilyNotes(circleId);
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
            ) : notes.length === 0 ? (
              <p className="text-xl text-muted">{t("No notes yet. Be the first to write one!")}</p>
            ) : (
              <ul aria-label={t("Notes, newest first")} className="flex flex-col gap-3">
                {notes.map((note) => {
                  const mine = note.author_id === userId;
                  return (
                    <li key={note.id} className="rounded-2xl bg-cream px-5 py-4 shadow-soft">
                      <p className="flex flex-wrap items-baseline gap-x-3 text-lg">
                        <strong className="font-extrabold text-ink">{noteAuthor(note, userId, names, t)}</strong>
                        <time
                          dateTime={note.created_at}
                          title={new Date(note.created_at).toLocaleString()}
                          className="font-bold text-muted"
                        >
                          {timeAgo(note.created_at, now, t)}
                        </time>
                      </p>
                      {/* Plain text: React shows it as written, never as HTML. */}
                      <p className="mt-1 whitespace-pre-wrap break-words text-xl text-ink">{note.body}</p>
                      {mine && (
                        <button
                          type="button"
                          onClick={() => confirmDelete(note.id)}
                          disabled={deleting === note.id}
                          aria-label={t("Delete your note from {when}", { when: timeAgo(note.created_at, now, t) })}
                          className={`${smallButton} mt-3`}
                        >
                          {deleting === note.id ? t("Deleting…") : t("Delete")}
                        </button>
                      )}
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
