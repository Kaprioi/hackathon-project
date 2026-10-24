import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { shortName } from "./alerts";
import { cleanNote, isMissingTable, mergeNotes, NOTES_SHOWN, removeNote, type Note } from "./notes";

// Family notes: loads this care circle's notes, listens live for new and deleted
// ones, and posts or deletes your own. Needs the family_notes table from
// supabase/migrations/20261024041200_family_notes.sql. If that hasn't been run
// yet, the card shows a friendly "not switched on yet" message instead.

const NOTE_COLUMNS = "id, author_id, body, created_at";

/** "loading" until the first answer, "missing" if the table isn't there yet. */
export type NotesState = "loading" | "ready" | "error" | "missing";

export function useFamilyNotes(circleId: string | undefined) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [state, setState] = useState<NotesState>("loading");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!circleId) return;
    const db = supabase!;
    let cancelled = false;

    function load() {
      db.from("family_notes")
        .select(NOTE_COLUMNS)
        .eq("circle_id", circleId!)
        .order("created_at", { ascending: false })
        .limit(NOTES_SHOWN)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) return setState(isMissingTable(error) ? "missing" : "error");
          setState("ready");
          // Replace rather than merge, so notes deleted while offline disappear too.
          setNotes(mergeNotes([], (data ?? []) as Note[]));
        });
    }

    // Names of people in the circle (you can see yourself and your circle mates).
    db.from("profiles")
      .select("id, display_name, email")
      .then(({ data }) => {
        if (cancelled || !data) return;
        setNames(Object.fromEntries(data.map((p) => [p.id, shortName(p)])));
      });

    // Its own channel, so if the table is missing the rest of the page still works.
    // Deletes can't be filtered by circle in Realtime; they only carry the note's id,
    // so removing an id we don't have does nothing.
    const channel = db
      .channel(`notes-${circleId}-${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "family_notes", filter: `circle_id=eq.${circleId}` },
        (payload) => setNotes((old) => mergeNotes(old, [payload.new as Note])),
      )
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "family_notes" }, (payload) => {
        const id = (payload.old as Partial<Note>).id;
        if (id != null) setNotes((old) => removeNote(old, id));
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
    setDeleting(id);
    setMessage("");
    const { error } = await supabase!.from("family_notes").delete().eq("id", id);
    setDeleting(null);
    if (error) return setMessage("Sorry, that note wasn't deleted. Please check your internet and try again.");
    setNotes((old) => removeNote(old, id));
  }

  return { notes, names, state, posting, deleting, message, post, remove };
}
