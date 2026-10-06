alter table public.trips
  add column if not exists operational_status text not null default 'AGENDADA',
  add column if not exists started_at timestamptz,
  add column if not exists arrived_origin_at timestamptz,
  add column if not exists departed_origin_at timestamptz,
  add column if not exists arrived_destination_at timestamptz,
  add column if not exists return_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_reason text,
  add column if not exists estimated_arrival_at timestamptz,
  add column if not exists estimated_return_at timestamptz,
  add column if not exists route_distance_km numeric,
  add column if not exists estimated_duration_minutes integer;

alter table public.trip_passengers
  add column if not exists boarded_at timestamptz,
  add column if not exists boarding_notes text;

create table if not exists public.trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  driver_id uuid references public.drivers(id),
  municipality_id uuid not null references public.municipalities(id),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  estimated_arrival_at timestamptz,
  estimated_return_at timestamptz,
  latitude numeric,
  longitude numeric,
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint trip_events_event_type_check check (
    event_type in ('TRIP_STARTED','ARRIVED_ORIGIN','PASSENGER_BOARDED','PASSENGER_NO_SHOW','DEPARTED_ORIGIN','ARRIVED_DESTINATION','RETURN_STARTED','ARRIVED_BASE','TRIP_COMPLETED','TRIP_CANCELLED','OCCURRENCE')
  )
);

create index if not exists idx_trips_operational_status on public.trips(operational_status);
create index if not exists idx_trips_estimated_arrival_at on public.trips(estimated_arrival_at);
create index if not exists idx_trips_estimated_return_at on public.trips(estimated_return_at);
create index if not exists idx_trip_events_trip_id_occurred_at on public.trip_events(trip_id, occurred_at desc);
create index if not exists idx_trip_events_municipality_id on public.trip_events(municipality_id);
create index if not exists idx_trip_events_driver_id on public.trip_events(driver_id);

alter table public.trip_events enable row level security;
