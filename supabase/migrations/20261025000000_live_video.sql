-- CareNest follow-up: live video.
--
-- Family can press "Watch live" on the family page to see and hear the phone camera
-- and talk back. The video and sound go straight between the phone and the family
-- member's browser (WebRTC, encrypted) and are never stored, so no table is needed.
--
-- The two only need to swap a few short "let's connect" messages first. They do that
-- on a private Supabase Realtime channel named live:<care circle id>. These rules
-- make sure only members of that care circle can listen to or send on it, so nobody
-- else can ask a family's phone for its video.
--
-- Run it after 20261024020000_checking_on_it.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3.

-- The circle id in a channel name like "live:0b5c...", or null for any other name.
create function public.live_channel_circle(topic text)
returns uuid
language sql
immutable
as $$
  select case
    when topic ~ '^live:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then substring(topic from 6)::uuid
  end;
$$;

create policy "live video: family members listen" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and public.is_circle_member(public.live_channel_circle(realtime.topic()))
  );

create policy "live video: family members send" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and public.is_circle_member(public.live_channel_circle(realtime.topic()))
  );
