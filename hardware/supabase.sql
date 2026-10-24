-- Run once in Supabase: SQL Editor > New query > paste > Run.
-- Creates the table the device writes alerts into and lets the web app read them.

create table if not exists events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  device text not null,
  type text not null,          -- 'out_of_sight' or 'back_in_view'
  message text,
  pan_angle int
);

alter table events enable row level security;

-- Hackathon-grade policies: anyone with the anon key can add and read events.
-- Tighten these (or use a device-specific key) before real-world use.
create policy "device can insert events" on events for insert to anon with check (true);
create policy "app can read events" on events for select to anon using (true);

-- Lets the web app get new alerts instantly via Supabase Realtime.
alter publication supabase_realtime add table events;
