-- Deploy only after review in Supabase SQL Editor. The UI must not call this RPC until deployed.
create or replace function public.start_trip_safely(p_trip_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_km numeric;
begin
  if (select private.current_user_role()) not in ('ADMIN'::public.user_role, 'GESTOR'::public.user_role, 'OPERADOR'::public.user_role) then
    raise exception 'Sem permissão para iniciar viagens.';
  end if;

  select * into v_trip from public.trips where id = p_trip_id for update;
  if not found then raise exception 'Viagem não encontrada ou sem acesso.'; end if;
  if v_trip.status <> 'SCHEDULED' then raise exception 'A viagem não está mais agendada.'; end if;
  if v_trip.vehicle_id is null then raise exception 'A viagem não possui veículo.'; end if;

  select * into v_vehicle from public.vehicles where id = v_trip.vehicle_id for update;
  if not found then raise exception 'Veículo não encontrado ou sem acesso.'; end if;
  if v_vehicle.municipality_id is distinct from v_trip.municipality_id then
    raise exception 'Veículo pertence a outro município.';
  end if;
  if v_vehicle.status <> 'AVAILABLE' then raise exception 'Veículo indisponível.'; end if;
  if v_vehicle.current_mileage is null or v_vehicle.current_mileage < 0 then
    raise exception 'KM atual inválido.';
  end if;

  v_km := coalesce(v_trip.initial_mileage, v_vehicle.current_mileage);
  if v_km < v_vehicle.current_mileage then raise exception 'KM inicial inferior ao atual.'; end if;

  if not exists (
    select 1 from public.trip_passengers
    where trip_id = p_trip_id
      and municipality_id = v_trip.municipality_id
      and boarding_status = 'EXPECTED'
  ) then
    raise exception 'A viagem está sem pacientes aguardando embarque.';
  end if;

  update public.vehicles set status = 'IN_USE'
    where id = v_vehicle.id and status = 'AVAILABLE';
  if not found then raise exception 'Não foi possível reservar o veículo.'; end if;

  update public.trips set status = 'IN_PROGRESS', initial_mileage = v_km
    where id = p_trip_id and status = 'SCHEDULED';
  if not found then raise exception 'A viagem foi alterada por outro operador.'; end if;
end;
$$;

revoke all on function public.start_trip_safely(uuid) from public, anon;
grant execute on function public.start_trip_safely(uuid) to authenticated;
