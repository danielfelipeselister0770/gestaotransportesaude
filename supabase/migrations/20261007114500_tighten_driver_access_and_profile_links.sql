drop policy if exists transport_requests_select on public.transport_requests;
create policy transport_requests_select on public.transport_requests
for select to authenticated
using (
  (select private.current_user_role()) = 'ADMIN'::public.user_role
  or ((select private.current_user_role()) = any (array['GESTOR'::public.user_role,'OPERADOR'::public.user_role]) and municipality_id = (select private.current_user_municipality_id()))
  or ((select private.current_user_role()) = 'MOTORISTA'::public.user_role and municipality_id = (select private.current_user_municipality_id()) and exists (
    select 1 from public.trip_passengers tp
    join public.trips t on t.id = tp.trip_id
    join public.drivers d on d.id = t.driver_id
    where tp.request_id = transport_requests.id and d.profile_id = (select auth.uid())
  ))
);

drop policy if exists trip_passengers_insert on public.trip_passengers;
create policy trip_passengers_insert on public.trip_passengers for insert to authenticated
with check ((select private.current_user_role()) = 'ADMIN'::public.user_role or ((select private.current_user_role()) = any (array['GESTOR'::public.user_role,'OPERADOR'::public.user_role]) and municipality_id = (select private.current_user_municipality_id())));

drop policy if exists trip_passengers_delete on public.trip_passengers;
create policy trip_passengers_delete on public.trip_passengers for delete to authenticated
using ((select private.current_user_role()) = 'ADMIN'::public.user_role or ((select private.current_user_role()) = any (array['GESTOR'::public.user_role,'OPERADOR'::public.user_role]) and municipality_id = (select private.current_user_municipality_id())));

create or replace function private.validate_driver_profile_link()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare linked_role public.user_role; linked_municipality uuid; linked_active boolean;
begin
  if new.profile_id is null then return new; end if;
  select p.role,p.municipality_id,p.active into linked_role,linked_municipality,linked_active from public.profiles p where p.id = new.profile_id;
  if linked_role is null then raise exception 'Perfil vinculado ao motorista não encontrado.'; end if;
  if linked_role <> 'MOTORISTA'::public.user_role then raise exception 'Somente perfil MOTORISTA pode ser vinculado a motorista.'; end if;
  if linked_active is not true then raise exception 'Perfil inativo não pode ser vinculado a motorista.'; end if;
  if linked_municipality is distinct from new.municipality_id then raise exception 'Perfil e motorista devem pertencer à mesma prefeitura.'; end if;
  return new;
end
$function$;
revoke execute on function private.validate_driver_profile_link() from public, anon, authenticated;
drop trigger if exists validate_driver_profile_link_trigger on public.drivers;
create trigger validate_driver_profile_link_trigger before insert or update of profile_id,municipality_id on public.drivers for each row execute function private.validate_driver_profile_link();
create unique index if not exists drivers_profile_id_unique_idx on public.drivers(profile_id) where profile_id is not null;
