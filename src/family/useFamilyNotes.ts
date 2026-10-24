import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { shortName } from "./alerts";
import {
  addReactions,
  cleanNote,
  doneCutoff,
  isMissingTable,
  mergeNotes,
  NOTES_SHOWN,
  removeNote,
  removeReaction,
  type Note,
  type Reaction,
  type ReactionKind,
} from "./notes";

// Family notes: loads this care circle's notes and reactions, listens live for
// new, ticked and deleted ones, and posts, ticks, reacts or deletes as you.
// Needs the family_notes and note_reactions tables from
// supabase/migrations/20261024041200_family_notes.sql. If that hasn't been run
// yet, the card shows a friendly "not switched on yet" message instead.

const NOTE_COLUMNS = "id, author_id, body, created_at, done_by, done_at";

/** "loading" until the first answer, "missing" if the table isn't there yet. */
export type NotesState = "loading" | "ready" | "error" | "missing";

const TRY_AGAIN = "Sorry, that didn't work. Please check your internet and try again.";

export function useFamilyNotes(circleId: string | undefined, userId: string) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [state, setState] = useState<NotesState>("loading");
  const [posting, setPosting] = useState(false);
  // Which note is being deleted or ticked right now, so its button can say so.
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!circleId) return;
    const db = supabase!;
    let cancelled = false;

    function load() {
      db.from("family_notes")
        .select(NOTE_COLUMNS)
        .eq("circle_id", circleId!)
        // Everything still to do, and "Done" notes from the last week.
        .or(`done_at.is.null,done_at.gte.${doneCutoff(Date.now())}`)
        .order("created_at", { ascending: false })
        .limit(NOTES_SHOWN)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) return setState(isMissingTable(error) ? "missing" : "error");
          setState("ready");
          // Replace rather than merge, so notes deleted while offline disappear too.
          setNotes(mergeNotes([], (data ?? []) as Note[]));
        });
      db.from("note_reactions")
        .select("note_id, user_id, kind")
        .eq("circle_id", circleId!)
        .limit(2000)
        .then(({ data, error }) => {
          // The notes still work without reactions, so no error message here.
          if (!cancelled && !error) setReactions(addReactions([], (data ?? []) as Reaction[]));
        });
    }

    // Names of people in the circle (you can see yourself and your circle mates).
    db.from("profiles")
      .select("id, display_name, email")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames(Object.fromEntries(data.map((p) => [p.id, shortName(p)])));
      });

    // Its own channel, so if the tables are missing the rest of the page still works.
    // Deletes can't be filtered by circle in Realtime; they only carry the row's key,
    // so removing something we don't have does nothing.
    const inCircle = `circle_id=eq.${circleId}`;
    const channel = db
      .channel(`notes-${circleId}-${crypto.randomUUID()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "family_notes", filter: inCircle }, (payload) =>
        setNotes((old) => mergeNotes(old, [payload.new as Note])),
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "family_notes", filter: inCircle }, (payload) =>
        setNotes((old) => mergeNotes(old, [payload.new as Note])),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "family_notes" }, (payload) => {
        const id = (payload.old as Partial<Note>).id;
        if (id != null) setNotes((old) => removeNote(old, id));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "note_reactions", filter: inCircle }, (payload) =>
        setReactions((old) => addReactions(old, [payload.new as Reaction])),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "note_reactions" }, (payload) => {
        const gone = payload.old as Partial<Reaction>;
        if (gone.note_id != null && gone.user_id && gone.kind) setReactions((old) => removeReaction(old, gone as Reaction));
      })
      .subscribe((status) => {
        if (!cancelled && status === "SUBSCRIBED") load();
      });

    load();
    return () => {
      cancelled = true;
      db.removeChannel(channel);
    };
  }, [circleId]);

  /** Saves a note. Returns true when it worked, so the box can be emptied. */
  async function post(text: string): Promise<boolean> {
    if (!circleId) return false;
    setPosting(true);
    setMessage("");
    const { data, error } = await supabase!
      .from("family_notes")
      .insert({ circle_id: circleId, body: cleanNote(text) })
      .select(NOTE_COLUMNS)
      .single();
    setPosting(false);
    if (error) {
      if (isMissingTable(error)) setState("missing");
      else setMessage("Sorry, your note wasn't saved. Please check your internet and try again.");
      return false;
    }
    setNotes((old) => mergeNotes(old, [data as Note]));
    return true;
  }

  async function remove(id: number) {
    setBusy(id);
    setMessage("");
    const { error } = await supabase!.from("family_notes").delete().eq("id", id);
    setBusy(null);
    if (error) return setMessage("Sorry, that note wasn't deleted. Please check your internet and try again.");
    setNotes((old) => removeNote(old, id));
  }

  /** Ticks a note "Done", or un-ticks it (only the person who ticked it can). */
  async function setDone(id: number, done: boolean) {
    setBusy(id);
    setMessage("");
    const { data, error } = await supabase!.rpc("set_note_done", { target_note: id, is_done: done });
    setBusy(null);
    if (error) return setMessage(isMissingTable(error) ? "Ticking notes as done isn't switched on yet." : TRY_AGAIN);
    setNotes((old) => mergeNotes(old, [data as Note]));
  }

  /** Adds your reaction, or takes it back if you'd already reacted. */
  async function toggleReaction(noteId: number, kind: ReactionKind) {
    if (!circleId) return;
    setMessage("");
    const mine: Reaction = { note_id: noteId, user_id: userId, kind };
    const had = reactions.some((r) => r.note_id === noteId && r.user_id === userId && r.kind === kind);
    // Show it straight away, and put it back if saving fails.
    setReactions((old) => (had ? removeReaction(old, mine) : addReactions(old, [mine])));
    const { error } = had
      ? await supabase!.from("note_reactions").delete().match(mine)
      : await supabase!.from("note_reactions").insert({ ...mine, circle_id: circleId });
    // "23505" means it was already there, which is fine.
    if (error && error.code !== "23505") {
      setReactions((old) => (had ? addReactions(old, [mine]) : removeReaction(old, mine)));
      setMessage(isMissingTable(error) ? "Reactions aren't switched on yet." : TRY_AGAIN);
    }
  }

  return { notes, reactions, names, state, posting, busy, message, post, remove, setDone, toggleReaction };
}
