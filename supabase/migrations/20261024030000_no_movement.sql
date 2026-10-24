-- CareNest follow-up: "No movement for a while".
--
-- When the phone camera is watching but nobody has moved for 3 hours during the
-- day, the phone sends one new kind of movement event: 'inactive'. That lets other
-- parts of CareNest (like phone or email alerts) react even when nobody has the
-- family page open. The family page also works out its own gentle heads-up.
--
-- This only lets the movement_events table accept 'inactive'. No new table, and
-- the Row Level Security rules are unchanged: only members of a care circle can
-- read its events, and a phone can only add events to its own circle.
--
-- Until this has been run, the phone just can't save 'inactive' (it quietly
-- carries on) and everything else works as before.
--
-- Run it after 20261024020000_checking_on_it.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3.

alter table public.movement_events drop constraint if exists movement_events_kind_check;

alter table public.movement_events
  add constraint movement_events_kind_check
  check (kind in ('moving', 'still', 'nobody', 'fall', 'heartbeat', 'started', 'stopped', 'inactive'));
