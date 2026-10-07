create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $function$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active is true
    and coalesce(p.must_change_password, false) is false
  limit 1
$function$;

create or replace function private.current_user_municipality_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $function$
  select p.municipality_id
  from public.profiles p
  where p.id = (select auth.uid())
    and p.active is true
    and coalesce(p.must_change_password, false) is false
  limit 1
$function$;

revoke execute on function private.current_user_role() from public, anon;
revoke execute on function private.current_user_municipality_id() from public, anon;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.current_user_municipality_id() to authenticated;
