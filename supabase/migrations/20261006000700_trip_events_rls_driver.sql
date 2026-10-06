create policy "trip_events_driver_select" on public.trip_events
for select to authenticated
using (
  private.current_user_role() = 'MOTORISTA'
  and municipality_id = private.current_user_municipality_id()
  and driver_id = (
    select d.id from public.drivers d
    where d.profile_id = auth.uid()
    limit 1
  )
);
