-- CareNest follow-up: "I'm checking on it".
--
-- When the family page shows a possible fall, anyone in the care circle can press
-- "I'm checking on it". Everyone else in the circle then sees "Sam is checking on
-- it" straight away, so they know someone is handling it.
--
-- This is its own small table (rather than new columns on movement_events) so that
-- events stay "never edited", as the first migration promises.
--
-- Run it after 20261024010000_family_fixes.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3.

create table public.event_acknowledgements (
  event_id bigint not null references public.movement_events (id) on delete cascade,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index event_acknowledgements_circle on public.event_acknowledgements (circle_id, created_at desc);

alter table public.event_acknowledgements enable row level security;

-- Members of the circle see who is checking on its events.
create policy "acks: members read" on public.event_acknowledgements
  for select to authenticated using (public.is_circle_member(circle_id));

-- You can only say that *you* are checking on it, only in your own circle, and only
-- for an event that really belongs to that circle.
create policy "acks: members add their own" on public.event_acknowledgements
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_circle_member(circle_id)
    and exists (
      select 1 from public.movement_events e
      where e.id = event_id and e.circle_id = event_acknowledgements.circle_id
    )
  );

-- Live updates: the family page listens for new rows via Realtime (which still
-- applies the policies above, so people only get their own circle).
alter publication supabase_realtime add table public.event_acknowledgements;
