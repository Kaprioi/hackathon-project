-- CareNest database: accounts, care circles, phones (devices) and movement events.
--
-- How it fits together:
--   * Everyone who signs up gets a row in `profiles` (made automatically by a trigger
--     on auth.users) and their own `care_circles` row, with themselves as the owner.
--   * A care circle is "one elderly person's home". The owner can add family members
--     to it (add_family_member below). Everyone in the circle sees the same events.
--   * A `devices` row is a phone standing on a table. It only ever sends small text
--     events into `movement_events` - never video or pictures.
--   * Row Level Security makes sure people only see rows from their own circle(s).
--
-- Apply it with the Supabase SQL editor (paste this whole file and press Run) or with
-- `supabase db push`. See README.md -> "Database setup".

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.care_circles (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My care circle',
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.care_circle_members (
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'family' check (role in ('owner', 'family')),
  created_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  name text not null default 'Phone camera',
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.movement_events (
  id bigint generated always as identity primary key,
  circle_id uuid not null references public.care_circles (id) on delete cascade,
  device_id uuid not null references public.devices (id) on delete cascade,
  -- What happened. 'heartbeat' is the once-a-minute "the phone is still watching".
  kind text not null check (kind in ('moving', 'still', 'nobody', 'fall', 'heartbeat', 'started', 'stopped')),
  zone text check (zone in ('left', 'middle', 'right')),
  posture text check (posture in ('standing', 'sitting', 'lying', 'unknown')),
  created_at timestamptz not null default now()
);

create index movement_events_circle_time on public.movement_events (circle_id, created_at desc);
create index devices_circle on public.devices (circle_id);
create index care_circle_members_user on public.care_circle_members (user_id);

-- ---------------------------------------------------------------------------
-- Helper: "is the signed-in user in this circle?"
-- security definer so the policies below don't loop back into themselves.
-- ---------------------------------------------------------------------------

create function public.is_circle_member(target_circle uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.care_circle_members
    where circle_id = target_circle and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- New account -> profile + own care circle (so the login page needs no changes)
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_circle uuid;
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.care_circles (owner_id) values (new.id) returning id into new_circle;
  insert into public.care_circle_members (circle_id, user_id, role) values (new_circle, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Accounts made before this migration ran get the same profile and care circle.
do $$
declare
  u record;
  new_circle uuid;
begin
  for u in select id, email from auth.users where id not in (select id from public.profiles) loop
    insert into public.profiles (id, email) values (u.id, u.email);
    insert into public.care_circles (owner_id) values (u.id) returning id into new_circle;
    insert into public.care_circle_members (circle_id, user_id, role) values (new_circle, u.id, 'owner');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Circle owner adds a family member by the email they signed up with.
-- Returns true if that person was found and added.
-- ---------------------------------------------------------------------------

create function public.add_family_member(target_circle uuid, member_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  member uuid;
begin
  if not exists (select 1 from public.care_circles where id = target_circle and owner_id = auth.uid()) then
    raise exception 'Only the owner of this care circle can add family members';
  end if;
  select id into member from public.profiles where lower(email) = lower(trim(member_email));
  if member is null then
    return false;
  end if;
  insert into public.care_circle_members (circle_id, user_id, role)
  values (target_circle, member, 'family')
  on conflict do nothing;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.care_circles enable row level security;
alter table public.care_circle_members enable row level security;
alter table public.devices enable row level security;
alter table public.movement_events enable row level security;

-- profiles: see and edit yourself, and see people who share a circle with you.
create policy "profiles: read self and circle mates" on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.care_circle_members m
      where m.user_id = profiles.id and public.is_circle_member(m.circle_id)
    )
  );
create policy "profiles: update self" on public.profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- care_circles: members can see it, only the owner can rename it.
create policy "circles: members read" on public.care_circles
  for select to authenticated using (public.is_circle_member(id));
create policy "circles: owner updates" on public.care_circles
  for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- care_circle_members: members see who else is in the circle; the owner can remove
-- people (adding goes through add_family_member).
create policy "members: members read" on public.care_circle_members
  for select to authenticated using (public.is_circle_member(circle_id));
create policy "members: owner removes" on public.care_circle_members
  for delete to authenticated
  using (exists (select 1 from public.care_circles c where c.id = circle_id and c.owner_id = auth.uid()));

-- devices: anyone in the circle can see, add, rename and remove its phones.
create policy "devices: members read" on public.devices
  for select to authenticated using (public.is_circle_member(circle_id));
create policy "devices: members add" on public.devices
  for insert to authenticated with check (public.is_circle_member(circle_id));
create policy "devices: members update" on public.devices
  for update to authenticated
  using (public.is_circle_member(circle_id)) with check (public.is_circle_member(circle_id));
create policy "devices: members remove" on public.devices
  for delete to authenticated using (public.is_circle_member(circle_id));

-- movement_events: members read; a phone can only write into its own circle, and the
-- device must belong to that circle. Events are never edited.
create policy "events: members read" on public.movement_events
  for select to authenticated using (public.is_circle_member(circle_id));
create policy "events: members add" on public.movement_events
  for insert to authenticated
  with check (
    public.is_circle_member(circle_id)
    and exists (select 1 from public.devices d where d.id = device_id and d.circle_id = movement_events.circle_id)
  );

-- ---------------------------------------------------------------------------
-- Live updates: the family page listens for new movement_events via Realtime.
-- (Realtime still applies the RLS policies above, so people only get their circle.)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.movement_events;
