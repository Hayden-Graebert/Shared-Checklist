-- Together Checklist — Supabase setup
-- Run this entire file in Supabase SQL Editor.
--
-- This version supports BOTH:
--   1. anonymous/guest sessions, and
--   2. permanent email + password accounts.
--
-- Important:
-- Creating an email/password account from the website upgrades the
-- current anonymous user instead of creating a new user ID. That means
-- a guest checklist already created in that browser can remain attached
-- to the same account.
--
-- Existing tables/policies/functions are updated safely so this file can
-- be run after the original anonymous-only SQL.

create extension if not exists pgcrypto;

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Things We’ll Do Together',
  invite_code text not null unique default encode(gen_random_bytes(10), 'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.list_members (
  list_id uuid not null references public.lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists(id) on delete cascade,
  text text not null check (char_length(trim(text)) between 1 and 160),
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists activities_list_id_created_at_idx
  on public.activities (list_id, created_at);

create index if not exists list_members_user_id_idx
  on public.list_members (user_id);

alter table public.lists enable row level security;
alter table public.list_members enable row level security;
alter table public.activities enable row level security;

-- Anonymous Supabase users use the authenticated database role, so these
-- policies deliberately apply to both anonymous sessions and permanent
-- email/password accounts.

-- Lists
drop policy if exists "members can read lists" on public.lists;
create policy "members can read lists"
  on public.lists
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = lists.id
        and lm.user_id = auth.uid()
    )
  );

drop policy if exists "users can create lists" on public.lists;
create policy "users can create lists"
  on public.lists
  for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "members can update lists" on public.lists;
create policy "members can update lists"
  on public.lists
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = lists.id
        and lm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = lists.id
        and lm.user_id = auth.uid()
    )
  );

-- Membership
-- A user can read only their own membership rows. This lets the website
-- build its "My checklists" list without exposing other users' memberships.
drop policy if exists "members can read membership" on public.list_members;
drop policy if exists "users can read their own membership" on public.list_members;
create policy "users can read their own membership"
  on public.list_members
  for select
  to authenticated
  using (user_id = auth.uid());

-- Membership rows are created by the security-definer functions below,
-- rather than allowing clients to insert arbitrary memberships.
drop policy if exists "users can add themselves to their created list" on public.list_members;
drop policy if exists "users can add themselves to lists" on public.list_members;

-- Create a list and its initial membership atomically.
create or replace function public.create_list(
  p_title text default 'Things We’ll Do Together'
)
returns public.lists
language plpgsql
security definer
set search_path = public
as $$
declare
  new_list public.lists;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  insert into public.lists (title, created_by)
  values (
    coalesce(nullif(trim(p_title), ''), 'Things We’ll Do Together'),
    auth.uid()
  )
  returning * into new_list;

  insert into public.list_members (list_id, user_id)
  values (new_list.id, auth.uid());

  return new_list;
end;
$$;

revoke all on function public.create_list(text) from public;
grant execute on function public.create_list(text) to authenticated;

-- Activities
drop policy if exists "members can read activities" on public.activities;
create policy "members can read activities"
  on public.activities
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = activities.list_id
        and lm.user_id = auth.uid()
    )
  );

drop policy if exists "members can add activities" on public.activities;
create policy "members can add activities"
  on public.activities
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = activities.list_id
        and lm.user_id = auth.uid()
    )
  );

drop policy if exists "members can update activities" on public.activities;
create policy "members can update activities"
  on public.activities
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = activities.list_id
        and lm.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = activities.list_id
        and lm.user_id = auth.uid()
    )
  );

drop policy if exists "members can delete activities" on public.activities;
create policy "members can delete activities"
  on public.activities
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.list_members lm
      where lm.list_id = activities.list_id
        and lm.user_id = auth.uid()
    )
  );

-- Join a checklist using its private invite code.
create or replace function public.join_list(
  p_list_id uuid,
  p_invite_code text
)
returns public.lists
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.lists;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  select *
    into target
  from public.lists
  where id = p_list_id
    and invite_code = p_invite_code;

  if not found then
    raise exception 'Invalid invitation link.';
  end if;

  insert into public.list_members (list_id, user_id)
  values (target.id, auth.uid())
  on conflict (list_id, user_id) do nothing;

  return target;
end;
$$;

revoke all on function public.join_list(uuid, text) from public;
grant execute on function public.join_list(uuid, text) to authenticated;

-- Keep updated_at current.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists lists_touch_updated_at on public.lists;
create trigger lists_touch_updated_at
before update on public.lists
for each row
execute function public.touch_updated_at();

drop trigger if exists activities_touch_updated_at on public.activities;
create trigger activities_touch_updated_at
before update on public.activities
for each row
execute function public.touch_updated_at();

-- Realtime. The DO blocks make this safe to run even if the tables were
-- already added to the publication by an earlier run.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'lists'
  ) then
    execute 'alter publication supabase_realtime add table public.lists';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activities'
  ) then
    execute 'alter publication supabase_realtime add table public.activities';
  end if;
end
$$;

-- Delete a checklist and its activities/memberships.
-- Only the original creator is authorized; shared members cannot delete it.
-- ON DELETE CASCADE foreign keys perform the related cleanup.
create or replace function public.delete_list(p_list_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  delete from public.lists
  where id = p_list_id and created_by = auth.uid();

  if not found then
    raise exception 'Only the checklist creator can delete this checklist, or it no longer exists.';
  end if;
end;
$$;

revoke all on function public.delete_list(uuid) from public;
grant execute on function public.delete_list(uuid) to authenticated;
