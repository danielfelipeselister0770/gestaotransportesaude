CREATE OR REPLACE FUNCTION public.finish_driver_trip_atomic(p_trip_id uuid, p_driver_user_id uuid, p_final_mileage numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t public.trips%rowtype; d public.drivers%rowtype; v public.vehicles%rowtype; p public.profiles%rowtype; rec record; now_at timestamptz := now();
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Unauthorized'; end if;
 select * into p from public.profiles where id=p_driver_user_id and role='MOTORISTA' and active=true;
 select * into d from public.drivers where profile_id=p_driver_user_id;
 select * into t from public.trips where id=p_trip_id for update;
 if not found or p.id is null or d.id is null or t.driver_id is distinct from d.id or t.municipality_id is distinct from p.municipality_id or d.municipality_id is distinct from p.municipality_id then raise exception 'Viagem não autorizada'; end if;
 if t.status <> 'IN_PROGRESS' then raise exception 'Viagem não está em andamento'; end if;
 if p_final_mileage is null or p_final_mileage < coalesce(t.initial_mileage,0) or p_final_mileage <> trunc(p_final_mileage) then raise exception 'Quilometragem inválida'; end if;
 if exists(select 1 from public.trip_passengers where trip_id=t.id and (boarding_status is null or boarding_status not in ('BOARDED','NO_SHOW','CANCELLED'))) then raise exception 'Existem embarques pendentes'; end if;
 if exists(select 1 from public.trip_passengers where trip_id=t.id and boarding_status='NO_SHOW' and nullif(trim(boarding_reason),'') is null) then raise exception 'Há ausência sem motivo'; end if;
 select * into v from public.vehicles where id=t.vehicle_id for update;
 if not found or v.municipality_id is distinct from t.municipality_id or v.status <> 'IN_USE' then raise exception 'Veículo indisponível para conclusão'; end if;
 if exists(select 1 from public.trip_passengers tp where tp.trip_id=t.id and tp.request_id is not null and not exists(select 1 from public.transport_requests req where req.id=tp.request_id and req.municipality_id=t.municipality_id)) then raise exception 'Solicitações vinculadas inválidas'; end if;
 for rec in
   select req.id,req.status,case when bool_or(tp.boarding_status='BOARDED') then 'COMPLETED' else 'NO_SHOW' end as next_status
   from public.trip_passengers tp join public.transport_requests req on req.id=tp.request_id
   where tp.trip_id=t.id and tp.boarding_status <> 'CANCELLED' group by req.id,req.status
 loop
   if rec.status::text not in ('SCHEDULED',rec.next_status) then raise exception 'Solicitação em situação incompatível'; end if;
   if rec.status::text='SCHEDULED' then
     update public.transport_requests set status=rec.next_status::public.request_status where id=rec.id and status='SCHEDULED';
   end if;
 end loop;
 update public.vehicles set current_mileage=p_final_mileage,status='AVAILABLE' where id=v.id;
 if exists(select 1 from public.mileage_records where trip_id=t.id and source='TRIP') then
   update public.mileage_records set mileage=p_final_mileage,date=now_at,observations='Quilometragem final registrada pelo motorista.' where trip_id=t.id and source='TRIP';
 else
   insert into public.mileage_records(vehicle_id,trip_id,mileage,source,observations,created_by,municipality_id)
   values(t.vehicle_id,t.id,p_final_mileage,'TRIP','Quilometragem final registrada pelo motorista.',p_driver_user_id,t.municipality_id);
 end if;
 update public.trips set status='COMPLETED',final_mileage=p_final_mileage,completed_at=now_at where id=t.id;
 return jsonb_build_object('ok',true,'status','COMPLETED','finalMileage',p_final_mileage,'distance',p_final_mileage-coalesce(t.initial_mileage,0));
end $function$
;