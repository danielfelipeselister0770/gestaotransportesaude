create or replace function private.validate_transport_secondary_tenant_links()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_table_name='mileage_records' then
    if new.vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.municipality_id=new.municipality_id) then raise exception 'Veículo pertence a outra prefeitura'; end if;
    if new.trip_id is not null and not exists(select 1 from public.trips t where t.id=new.trip_id and t.municipality_id=new.municipality_id) then raise exception 'Viagem pertence a outra prefeitura'; end if;
  end if;
  if tg_table_name='occurrences' then
    if new.trip_id is not null and not exists(select 1 from public.trips t where t.id=new.trip_id and t.municipality_id=new.municipality_id) then raise exception 'Viagem pertence a outra prefeitura'; end if;
    if new.vehicle_id is not null and not exists(select 1 from public.vehicles v where v.id=new.vehicle_id and v.municipality_id=new.municipality_id) then raise exception 'Veículo pertence a outra prefeitura'; end if;
    if new.driver_id is not null and not exists(select 1 from public.drivers d where d.id=new.driver_id and d.municipality_id=new.municipality_id) then raise exception 'Motorista pertence a outra prefeitura'; end if;
    if new.patient_id is not null and not exists(select 1 from public.patients p where p.id=new.patient_id and p.municipality_id=new.municipality_id) then raise exception 'Paciente pertence a outra prefeitura'; end if;
  end if;
  return new;
end $$;
drop trigger if exists validate_mileage_tenant on public.mileage_records;
create trigger validate_mileage_tenant before insert or update of municipality_id,vehicle_id,trip_id on public.mileage_records for each row execute function private.validate_transport_secondary_tenant_links();
drop trigger if exists validate_occurrence_tenant on public.occurrences;
create trigger validate_occurrence_tenant before insert or update of municipality_id,trip_id,vehicle_id,driver_id,patient_id on public.occurrences for each row execute function private.validate_transport_secondary_tenant_links();
