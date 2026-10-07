create or replace function private.validate_transport_tenant_links()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='transport_requests' and new.patient_id is not null and not exists(select 1 from public.patients p where p.id=new.patient_id and p.municipality_id=new.municipality_id) then raise exception 'Paciente pertence a outra prefeitura'; end if;
  if tg_table_name='trips' then
    if new.vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.municipality_id=new.municipality_id) then raise exception 'Veículo pertence a outra prefeitura'; end if;
    if new.driver_id is not null and not exists(select 1 from public.drivers d where d.id=new.driver_id and d.municipality_id=new.municipality_id) then raise exception 'Motorista pertence a outra prefeitura'; end if;
  end if;
  if tg_table_name='trip_passengers' then
    if not exists(select 1 from public.trips t where t.id=new.trip_id and t.municipality_id=new.municipality_id) then raise exception 'Viagem pertence a outra prefeitura'; end if;
    if not exists(select 1 from public.patients p where p.id=new.patient_id and p.municipality_id=new.municipality_id) then raise exception 'Paciente pertence a outra prefeitura'; end if;
    if new.request_id is not null and not exists(select 1 from public.transport_requests r where r.id=new.request_id and r.municipality_id=new.municipality_id) then raise exception 'Solicitação pertence a outra prefeitura'; end if;
  end if;
  if tg_table_name in ('fuelings','maintenances') and new.vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.municipality_id=new.municipality_id) then raise exception 'Veículo pertence a outra prefeitura'; end if;
  return new;
end $$;
drop trigger if exists validate_transport_request_tenant on public.transport_requests;
create trigger validate_transport_request_tenant before insert or update of municipality_id,patient_id on public.transport_requests for each row execute function private.validate_transport_tenant_links();
drop trigger if exists validate_trip_tenant on public.trips;
create trigger validate_trip_tenant before insert or update of municipality_id,vehicle_id,driver_id on public.trips for each row execute function private.validate_transport_tenant_links();
drop trigger if exists validate_trip_passenger_tenant on public.trip_passengers;
create trigger validate_trip_passenger_tenant before insert or update of municipality_id,trip_id,patient_id,request_id on public.trip_passengers for each row execute function private.validate_transport_tenant_links();
drop trigger if exists validate_fueling_tenant on public.fuelings;
create trigger validate_fueling_tenant before insert or update of municipality_id,vehicle_id on public.fuelings for each row execute function private.validate_transport_tenant_links();
drop trigger if exists validate_maintenance_tenant on public.maintenances;
create trigger validate_maintenance_tenant before insert or update of municipality_id,vehicle_id on public.maintenances for each row execute function private.validate_transport_tenant_links();
