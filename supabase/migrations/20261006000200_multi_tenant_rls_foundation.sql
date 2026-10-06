-- Multi-prefeitura RLS foundation
-- Keeps authorization data in profiles and enforces municipality isolation at the database layer.

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1
$$;

create or replace function private.current_user_municipality_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.municipality_id
  from public.profiles p
  where p.id = (select auth.uid())
  limit 1
$$;

revoke execute on function private.current_user_role() from public;
revoke execute on function private.current_user_municipality_id() from public;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_user_municipality_id() to authenticated;

alter table public.municipalities enable row level security;

drop policy if exists "municipalities_select" on public.municipalities;
drop policy if exists "municipalities_insert" on public.municipalities;
drop policy if exists "municipalities_update" on public.municipalities;
drop policy if exists "municipalities_delete" on public.municipalities;

create policy "municipalities_select"
on public.municipalities for select
to authenticated
using (
  (select private.current_user_role()) = 'ADMIN'::public.user_role
  or id = (select private.current_user_municipality_id())
);

create policy "municipalities_insert"
on public.municipalities for insert
to authenticated
with check ((select private.current_user_role()) = 'ADMIN'::public.user_role);

create policy "municipalities_update"
on public.municipalities for update
to authenticated
using ((select private.current_user_role()) = 'ADMIN'::public.user_role)
with check ((select private.current_user_role()) = 'ADMIN'::public.user_role);

create policy "municipalities_delete"
on public.municipalities for delete
to authenticated
using ((select private.current_user_role()) = 'ADMIN'::public.user_role);

drop policy if exists "profiles_insert" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;

create policy "profiles_insert"
on public.profiles for insert
to authenticated
with check ((select private.current_user_role()) = 'ADMIN'::public.user_role);

create policy "profiles_select"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.current_user_role()) = 'ADMIN'::public.user_role
  or (
    (select private.current_user_role()) = 'GESTOR'::public.user_role
    and municipality_id = (select private.current_user_municipality_id())
  )
);

create policy "profiles_update"
on public.profiles for update
to authenticated
using (
  (select private.current_user_role()) = 'ADMIN'::public.user_role
  or id = (select auth.uid())
)
with check (
  (select private.current_user_role()) = 'ADMIN'::public.user_role
  or (
    id = (select auth.uid())
    and role = (select private.current_user_role())
    and municipality_id is not distinct from (select private.current_user_municipality_id())
  )
);
