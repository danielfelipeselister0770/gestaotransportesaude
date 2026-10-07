-- Consolida sincronizacao de frota e remove triggers/funcoes legadas duplicadas.
create or replace function private.sync_vehicle_from_maintenance()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  if new.mileage is not null then
    update public.vehicles set current_mileage=greatest(current_mileage,new.mileage),updated_at=now() where id=new.vehicle_id;
  end if;
  if new.status='IN_PROGRESS'::public.maintenance_status then
    update public.vehicles set status='MAINTENANCE'::public.vehicle_status,updated_at=now()
    where id=new.vehicle_id and status<>'IN_USE'::public.vehicle_status;
  elsif new.status in ('COMPLETED'::public.maintenance_status,'CANCELLED'::public.maintenance_status)
    and (tg_op='INSERT' or old.status is distinct from new.status) then
    update public.vehicles v
    set status=case
      when exists(select 1 from public.maintenances m where m.vehicle_id=new.vehicle_id and m.id<>new.id and m.status='IN_PROGRESS'::public.maintenance_status) then 'MAINTENANCE'::public.vehicle_status
      when exists(select 1 from public.trips t where t.vehicle_id=new.vehicle_id and t.status in ('SCHEDULED'::public.trip_status,'IN_PROGRESS'::public.trip_status)) then 'IN_USE'::public.vehicle_status
      else 'AVAILABLE'::public.vehicle_status end,
      updated_at=now()
    where v.id=new.vehicle_id;
  end if;
  return new;
end
$function$;

drop trigger if exists trg_sync_vehicle_from_fueling on public.fuelings;
drop trigger if exists trg_sync_vehicle_from_maintenance on public.maintenances;
drop function if exists public.sync_vehicle_from_fueling();
drop function if exists public.sync_vehicle_from_maintenance();
revoke execute on function private.sync_vehicle_from_fueling() from public,anon,authenticated;
revoke execute on function private.sync_vehicle_from_maintenance() from public,anon,authenticated;
