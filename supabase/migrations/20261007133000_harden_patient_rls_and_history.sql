drop policy if exists patients_select_same_municipality on public.patients;
drop policy if exists patients_insert_same_municipality on public.patients;
drop policy if exists patients_update_same_municipality on public.patients;

create policy patients_select_same_municipality on public.patients for select to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));
create policy patients_insert_same_municipality on public.patients for insert to authenticated
with check ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));
create policy patients_update_same_municipality on public.patients for update to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())))
with check ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));

alter function private.record_patient_history() security definer;
revoke all on function private.record_patient_history() from public, anon, authenticated;
drop policy if exists patient_history_insert_same_municipality on public.patient_history;
drop policy if exists patient_history_select_same_municipality on public.patient_history;
create policy patient_history_select_same_municipality on public.patient_history for select to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));
revoke insert,update,delete on public.patient_history from authenticated;
