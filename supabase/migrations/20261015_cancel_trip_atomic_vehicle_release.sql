-- Atomic cancellation and conditional vehicle release.
create or replace function public.cancel_trip_safely(p_trip_id uuid, p_reason text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare v_trip public.trips%rowtype; v_vehicle public.vehicles%rowtype;
begin
  if (select private.current_user_role()) not in ('ADMIN'::public.user_role,'GESTOR'::public.user_role,'OPERADOR'::public.user_role) then
    raise exception 'Sem permissão para cancelar viagens.';
  end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'Informe o motivo do cancelamento.'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found then raise exception 'Viagem não encontrada ou sem acesso.'; end if;
  if v_trip.status not in ('SCHEDULED','IN_PROGRESS') then raise exception 'Viagem não pode mais ser cancelada.'; end if;
  if v_trip.status='IN_PROGRESS' and v_trip.vehicle_id is not null then
    select * into v_vehicle from public.vehicles where id=v_trip.vehicle_id for update;
    if not found then raise exception 'Veículo não encontrado ou sem acesso.'; end if;
  end if;
  update public.trips set status='CANCELLED',cancellation_reason=btrim(p_reason),cancelled_at=now()
  where id=p_trip_id and status=v_trip.status;
  if not found then raise exception 'A viagem foi alterada por outro operador.'; end if;
  if v_trip.status='IN_PROGRESS' and v_trip.vehicle_id is not null and v_vehicle.status='IN_USE' then
    if not exists (select 1 from public.trips
      where vehicle_id=v_trip.vehicle_id and id<>p_trip_id and status='IN_PROGRESS') then
      update public.vehicles set status='AVAILABLE'
      where id=v_trip.vehicle_id and status='IN_USE';
      if not found then raise exception 'Não foi possível liberar o veículo.'; end if;
    end if;
  end if;
end $$;
revoke all on function public.cancel_trip_safely(uuid,text) from public,anon;
grant execute on function public.cancel_trip_safely(uuid,text) to authenticated;
