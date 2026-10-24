-- CareNest follow-up: daily reminders.
--
-- Family add reminders on the family page only if they need them, like "Heart pills"
-- at 08:00 or "Lunch" at 12:30. At that time the phone on the table shows a big card
-- and says it out loud, with an "I did it" button. Pressing it adds a row to
-- reminder_checks, so family see "Done at 8:02" (or "Missed" if nobody pressed it).
--
-- Run it after 20261024041200_family_notes.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3.

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  kind text not null default 'other' check (kind in ('medicine', 'meal', 'drink', 'other')),
  label text not null check (char_length(btrim(label)) between 1 and 60),
  -- Time of day on the phone's own clock, like 08:00.
  remind_at time not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index reminders_circle on public.reminders (circle_id, remind_at);

-- One row per reminder per day once it is done. `day` is the phone's own date,
-- like 2026-10-24, so "today" means the same thing on the phone and the family page.
create table public.reminder_checks (
  reminder_id uuid not null references public.reminders (id) on delete cascade,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  day date not null,
  done_at timestamptz not null default now(),
  primary key (reminder_id, day)
);

create index reminder_checks_circle_day on public.reminder_checks (circle_id, day);

alter table public.reminders enable row level security;
alter table public.reminder_checks enable row level security;

-- Anyone in the care circle can see, add and remove its reminders.
create policy "reminders: members read" on public.reminders
  for select to authenticated using (public.is_circle_member(circle_id));
create policy "reminders: members add" on public.reminders
  for insert to authenticated
  with check (public.is_circle_member(circle_id) and created_by = auth.uid());
create policy "reminders: members remove" on public.reminders
  for delete to authenticated using (public.is_circle_member(circle_id));

-- Members see what was done, and can mark a reminder of their own circle as done.
create policy "reminder checks: members read" on public.reminder_checks
  for select to authenticated using (public.is_circle_member(circle_id));
create policy "reminder checks: members add" on public.reminder_checks
  for insert to authenticated
  with check (
    public.is_circle_member(circle_id)
    and exists (
      select 1 from public.reminders r
      where r.id = reminder_id and r.circle_id = reminder_checks.circle_id
    )
  );

-- Live updates for the phone and the family page (Realtime still applies the
-- policies above, so people only get their own circle).
alter publication supabase_realtime add table public.reminders;
alter publication supabase_realtime add table public.reminder_checks;
