-- CareNest follow-up: alerts that reach family anywhere (phone notifications).
--
-- A family member presses "Get alerts on this device" on the family page. Their
-- browser gives us a "push subscription" (an address only that browser can be
-- reached at), and we keep it here, one row per person + care circle + device.
-- When the phone camera notices a possible fall, the server function in
-- api/notify.ts sends a notification to every device in that circle.
--
--   * push_subscriptions: each device that wants alerts, with the language and
--     time zone to write them in, and which kinds of alert it wants.
--   * push_alerts_sent: which events have already been sent out, so the same fall
--     is never sent twice. Only the server (service role) uses it.
--
-- Run it after 20261024030000_no_movement.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3.

create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  -- The push subscription from the browser (where to send, and its two keys).
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  -- How to write the alert for this person: language, time zone, and what they call
  -- the person they care for (like "Mum"; empty means just "Possible fall").
  lang text not null default 'en' check (lang in ('en', 'es', 'zh')),
  time_zone text not null default 'UTC',
  who text not null default '' check (char_length(who) <= 60),
  -- Which alerts this device wants. Possible falls are always sent.
  kinds text[] not null default '{fall}' check (kinds <@ array['fall', 'stopped', 'inactive']),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, user_id, endpoint)
);

create index push_subscriptions_circle on public.push_subscriptions (circle_id);

create table public.push_alerts_sent (
  event_id bigint primary key references public.movement_events (id) on delete cascade,
  sent_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
alter table public.push_alerts_sent enable row level security;

-- push_subscriptions: you only see, add, change and remove your own devices, and
-- only for a circle you are in. (The server reads everyone's to send the alerts.)
create policy "push: read own" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid() and public.is_circle_member(circle_id));
create policy "push: add own" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid() and public.is_circle_member(circle_id));
create policy "push: update own" on public.push_subscriptions
  for update to authenticated
  using (user_id = auth.uid() and public.is_circle_member(circle_id))
  with check (user_id = auth.uid() and public.is_circle_member(circle_id));
create policy "push: remove own" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- push_alerts_sent has no policies on purpose: only the server (service role key)
-- can read or write it.
