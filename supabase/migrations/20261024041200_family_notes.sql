-- CareNest follow-up: Family notes.
--
-- A small shared note board on the family page, so the family can coordinate
-- ("I'll visit Saturday"). Everyone in the care circle sees the notes; you can
-- only post as yourself, and only delete your own. No editing: to change a note,
-- delete it and post a new one.
--
-- Anyone in the circle can tick a note as "Done" (and the same person can undo
-- it), and leave a quick reaction (thumbs up, heart, tick) on any note.
--
-- Run it after 20261024020000_checking_on_it.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3. Until it is run,
-- the family page shows a friendly "not switched on yet" message in its place.

create table public.family_notes (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- Plain text, 1 to 280 characters (not counting spaces at the ends).
  body text not null check (char_length(btrim(body)) between 1 and 280),
  created_at timestamptz not null default now(),
  -- Who ticked it "Done", and when. Both empty while it is still to do.
  done_by uuid references public.profiles (id) on delete set null,
  done_at timestamptz,
  check ((done_by is null) = (done_at is null))
);

create index family_notes_circle on public.family_notes (circle_id, created_at desc);

alter table public.family_notes enable row level security;

-- Members of the circle read its notes.
create policy "notes: members read" on public.family_notes
  for select to authenticated using (public.is_circle_member(circle_id));

-- You can only post as yourself, and only in a circle you belong to, and a new
-- note can't start out as "Done".
create policy "notes: members add their own" on public.family_notes
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.is_circle_member(circle_id)
    and done_by is null
    and done_at is null
  );

-- You can only delete your own notes.
create policy "notes: authors delete their own" on public.family_notes
  for delete to authenticated using (author_id = auth.uid());

-- There is no update policy, so nobody can change a note's text. Ticking "Done"
-- goes through this function instead, which only ever touches done_by/done_at.
create function public.set_note_done(target_note bigint, is_done boolean)
returns public.family_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  note public.family_notes;
begin
  if is_done then
    -- Any member of the note's circle can tick it (if nobody has yet).
    update public.family_notes
      set done_by = auth.uid(), done_at = now()
      where id = target_note and done_by is null and public.is_circle_member(circle_id)
      returning * into note;
  else
    -- Only the person who ticked it can undo it.
    update public.family_notes
      set done_by = null, done_at = null
      where id = target_note and done_by = auth.uid() and public.is_circle_member(circle_id)
      returning * into note;
  end if;
  if note.id is null then
    raise exception 'That note can''t be changed';
  end if;
  return note;
end;
$$;

revoke execute on function public.set_note_done(bigint, boolean) from public, anon;
grant execute on function public.set_note_done(bigint, boolean) to authenticated;

-- Quick reactions under each note: one of each kind per person.
create table public.note_reactions (
  note_id bigint not null references public.family_notes (id) on delete cascade,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- thumbs = 👍, heart = ❤️, tick = ✅
  kind text not null check (kind in ('thumbs', 'heart', 'tick')),
  created_at timestamptz not null default now(),
  primary key (note_id, user_id, kind)
);

create index note_reactions_circle on public.note_reactions (circle_id);

alter table public.note_reactions enable row level security;

-- Members of the circle see its reactions.
create policy "reactions: members read" on public.note_reactions
  for select to authenticated using (public.is_circle_member(circle_id));

-- You can only react as yourself, in your own circle, on a note from that circle.
create policy "reactions: members add their own" on public.note_reactions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_circle_member(circle_id)
    and exists (
      select 1 from public.family_notes n
      where n.id = note_id and n.circle_id = note_reactions.circle_id
    )
  );

-- You can only take back your own reactions.
create policy "reactions: remove their own" on public.note_reactions
  for delete to authenticated using (user_id = auth.uid());

-- Live updates: the family page listens for new, ticked and deleted notes and
-- reactions via Realtime (which still applies the read policies above, so people
-- only get their own circle).
alter publication supabase_realtime add table public.family_notes;
alter publication supabase_realtime add table public.note_reactions;
