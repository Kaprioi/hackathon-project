-- CareNest follow-up: Family notes.
--
-- A small shared note board on the family page, so the family can coordinate
-- ("I'll visit Saturday"). Everyone in the care circle sees the notes; you can
-- only post as yourself, and only delete your own. No editing: to change a note,
-- delete it and post a new one.
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
  created_at timestamptz not null default now()
);

create index family_notes_circle on public.family_notes (circle_id, created_at desc);

alter table public.family_notes enable row level security;

-- Members of the circle read its notes.
create policy "notes: members read" on public.family_notes
  for select to authenticated using (public.is_circle_member(circle_id));

-- You can only post as yourself, and only in a circle you belong to.
create policy "notes: members add their own" on public.family_notes
  for insert to authenticated
  with check (author_id = auth.uid() and public.is_circle_member(circle_id));

-- You can only delete your own notes.
create policy "notes: authors delete their own" on public.family_notes
  for delete to authenticated using (author_id = auth.uid());

-- Live updates: the family page listens for new and deleted notes via Realtime
-- (which still applies the read policy above, so people only get their own circle).
alter publication supabase_realtime add table public.family_notes;
