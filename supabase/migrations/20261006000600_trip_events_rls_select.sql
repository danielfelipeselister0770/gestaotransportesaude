create policy "trip_events_select" on public.trip_events
for select to authenticated
using (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() in ('GESTOR','OPERADOR')
    and municipality_id = private.current_user_municipality_id()
  )
);
