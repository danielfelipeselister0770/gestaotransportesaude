revoke insert, update, delete, truncate on public.audit_logs from authenticated;
revoke insert, update, delete, truncate on public.user_admin_history from authenticated;
drop policy if exists occurrence_history_select_same_municipality on public.occurrence_history;
create policy occurrence_history_select_same_municipality on public.occurrence_history for select to authenticated using ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));
drop policy if exists request_history_select_same_municipality on public.transport_request_history;
create policy request_history_select_same_municipality on public.transport_request_history for select to authenticated using ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));
drop policy if exists trip_history_select_same_municipality on public.trip_history;
create policy trip_history_select_same_municipality on public.trip_history for select to authenticated using ((select private.current_user_role())='ADMIN'::public.user_role or ((select private.current_user_role()) in ('GESTOR'::public.user_role,'OPERADOR'::public.user_role) and municipality_id=(select private.current_user_municipality_id())));
