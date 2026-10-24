-- CareNest follow-up: safer "add a family member".
--
--   * add_family_member now finds people by the email they signed up with
--     (auth.users), not by profiles.email, so nobody can pretend to own an email.
--   * People can no longer change the email on their own profile row (only their
--     display name).
--   * add_family_member no longer says whether an email has a CareNest account:
--     it gives the same answer for every email.
--
-- Run it after 20261024000000_carenest_schema.sql (Supabase SQL editor, or
-- `supabase db push`). See README.md -> "Run the app", step 3.

drop function public.add_family_member(uuid, text);

create function public.add_family_member(target_circle uuid, member_email text)
returns void
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
  select id into member from auth.users where lower(email) = lower(trim(member_email)) limit 1;
  if member is not null then
    insert into public.care_circle_members (circle_id, user_id, role)
    values (target_circle, member, 'family')
    on conflict do nothing;
  end if;
end;
$$;

revoke update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;
