-- Security/RLS hardening and centralized audit
drop policy if exists mileage_select on public.mileage_records;
drop policy if exists mileage_insert on public.mileage_records;

drop policy if exists patients_select_same_municipality on public.patients;
create policy patients_select_same_municipality on public.patients for select to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or (municipality_id=(select private.current_user_municipality_id()) and (select private.current_user_role())=any(array['GESTOR'::public.user_role,'OPERADOR'::public.user_role])));

drop policy if exists patients_insert_same_municipality on public.patients;
create policy patients_insert_same_municipality on public.patients for insert to authenticated
with check ((select private.current_user_role())='ADMIN'::public.user_role or (municipality_id=(select private.current_user_municipality_id()) and (select private.current_user_role())=any(array['GESTOR'::public.user_role,'OPERADOR'::public.user_role])));

drop policy if exists patients_update_same_municipality on public.patients;
create policy patients_update_same_municipality on public.patients for update to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or (municipality_id=(select private.current_user_municipality_id()) and (select private.current_user_role())=any(array['GESTOR'::public.user_role,'OPERADOR'::public.user_role])))
with check ((select private.current_user_role())='ADMIN'::public.user_role or (municipality_id=(select private.current_user_municipality_id()) and (select private.current_user_role())=any(array['GESTOR'::public.user_role,'OPERADOR'::public.user_role])));

drop policy if exists patient_history_select_same_municipality on public.patient_history;
create policy patient_history_select_same_municipality on public.patient_history for select to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or (municipality_id=(select private.current_user_municipality_id()) and (select private.current_user_role())=any(array['GESTOR'::public.user_role,'OPERADOR'::public.user_role])));
drop policy if exists patient_history_insert_same_municipality on public.patient_history;
revoke insert on public.patient_history from authenticated;

create or replace function private.audit_row_change() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid; mid uuid; oldj jsonb; newj jsonb;
begin
 oldj:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
 newj:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
 rid:=coalesce((newj->>'id')::uuid,(oldj->>'id')::uuid);
 mid:=coalesce((newj->>'municipality_id')::uuid,(oldj->>'municipality_id')::uuid,(select private.current_user_municipality_id()));
 insert into public.audit_logs(user_id,action,table_name,record_id,old_data,new_data,municipality_id)
 values((select auth.uid()),tg_op,tg_table_name,rid,oldj,newj,mid);
 return coalesce(new,old);
end;$$;
revoke all on function private.audit_row_change() from public;
grant execute on function private.audit_row_change() to authenticated;

do $$ declare t text; begin
 foreach t in array array['patients','drivers','vehicles','health_units','health_professionals','health_professional_links','transport_requests','trips','trip_passengers','mileage_records','fuelings','maintenances','occurrences']
 loop
  execute format('drop trigger if exists audit_changes on public.%I',t);
  execute format('create trigger audit_changes after insert or update or delete on public.%I for each row execute function private.audit_row_change()',t);
 end loop;
end $$;
create index if not exists audit_logs_municipality_created_idx on public.audit_logs(municipality_id,created_at desc);
create index if not exists audit_logs_table_record_idx on public.audit_logs(table_name,record_id,created_at desc);