-- Completes a trip, reconciles active requests, records final mileage and releases vehicle atomically.
create or replace function public.complete_trip_safely(p_trip_id uuid,p_initial_mileage numeric,p_final_mileage numeric,p_observations text)
returns void language plpgsql security invoker set search_path = ''
as $$
declare
  v_trip public.trips%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_request_id uuid;
  v_request_status public.request_status;
begin
  if (select private.current_user_role()) not in ('ADMIN'::public.user_role,'GESTOR'::public.user_role,'OPERADOR'::public.user_role) then
    raise exception 'Sem permissão para concluir viagens.';
  end if;
  if p_initial_mileage is null or p_final_mileage is null or p_initial_mileage < 0
    or p_final_mileage < p_initial_mileage or p_initial_mileage <> trunc(p_initial_mileage)
    or p_final_mileage <> trunc(p_final_mileage) then
    raise exception 'Quilometragem inicial ou final inválida.';
  end if;
  if length(coalesce(p_observations,'')) > 2000 then raise exception 'Observações muito longas.'; end if;
  select * into v_trip from public.trips where id=p_trip_id for update;
  if not found then raise exception 'Viagem não encontrada ou sem acesso.'; end if;
  if v_trip.status <> 'IN_PROGRESS' then raise exception 'Somente viagens em andamento podem ser concluídas.'; end if;
  select * into v_vehicle from public.vehicles where id=v_trip.vehicle_id for update;
  if not found then raise exception 'Veículo não encontrado ou sem acesso.'; end if;
  if v_vehicle.municipality_id is distinct from v_trip.municipality_id then raise exception 'Município do veículo não corresponde ao da viagem.'; end if;
  if v_vehicle.status <> 'IN_USE' then raise exception 'Veículo não está em uso. Confira o cadastro.'; end if;
  if p_final_mileage < v_vehicle.current_mileage then raise exception 'KM final inferior ao KM atual do veículo.'; end if;
  if v_trip.initial_mileage is not null and p_initial_mileage <> v_trip.initial_mileage then
    raise exception 'KM inicial diferente do registrado no início da viagem.';
  end if;
  if not exists (select 1 from public.trip_passengers where trip_id=p_trip_id) then
    raise exception 'Viagem sem passageiros.';
  end if;
  if exists (select 1 from public.trip_passengers where trip_id=p_trip_id and boarding_status='EXPECTED') then
    raise exception 'Há passageiros aguardando definição de embarque.';
  end if;
  if exists (select 1 from public.trips where vehicle_id=v_vehicle.id and id<>p_trip_id and status='IN_PROGRESS') then
    raise exception 'Há outra viagem em andamento usando este veículo.';
  end if;
  -- Lock requests deterministically and refuse unexpected states.
  for v_request_id in
    select distinct tp.request_id from public.trip_passengers tp
    where tp.trip_id=p_trip_id and tp.boarding_status <> 'CANCELLED' and tp.request_id is not null
    order by tp.request_id
  loop
    select status into v_request_status from public.transport_requests where id=v_request_id for update;
    if not found or v_request_status <> 'SCHEDULED' then
      raise exception 'Solicitação vinculada não está agendada: %',v_request_id;
    end if;
    update public.transport_requests set status='COMPLETED' where id=v_request_id;
  end loop;
  update public.trips set status='COMPLETED',initial_mileage=p_initial_mileage,
    final_mileage=p_final_mileage,observations=nullif(btrim(coalesce(p_observations,'')),''),
    completed_at=now() where id=p_trip_id and status='IN_PROGRESS';
  if not found then raise exception 'Viagem alterada por outro operador.'; end if;
  update public.vehicles set current_mileage=p_final_mileage,status='AVAILABLE'
    where id=v_vehicle.id and status='IN_USE';
  if not found then raise exception 'Não foi possível liberar o veículo.'; end if;
  if not exists (select 1 from public.mileage_records
    where trip_id=p_trip_id and source='TRIP' and observations='Quilometragem final da viagem') then
    insert into public.mileage_records(vehicle_id,trip_id,date,mileage,source,observations,created_by,municipality_id)
    values(v_vehicle.id,p_trip_id,now(),p_final_mileage,'TRIP','Quilometragem final da viagem',auth.uid(),v_trip.municipality_id);
  else
    update public.mileage_records set mileage=p_final_mileage,date=now()
    where trip_id=p_trip_id and source='TRIP' and observations='Quilometragem final da viagem';
  end if;
end $$;
revoke all on function public.complete_trip_safely(uuid,numeric,numeric,text) from public,anon;
grant execute on function public.complete_trip_safely(uuid,numeric,numeric,text) to authenticated;
