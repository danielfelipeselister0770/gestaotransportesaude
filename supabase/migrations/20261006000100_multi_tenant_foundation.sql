-- Multi-prefeitura foundation
-- Keeps the first municipality deterministic so this migration can reproduce the current tenant.
create table if not exists public.municipalities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cnpj text,
  city text,
  state text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.patients add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.drivers add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.vehicles add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.health_units add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.transport_requests add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.trips add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.trip_passengers add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.mileage_records add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.fuelings add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.maintenances add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.occurrences add column if not exists municipality_id uuid references public.municipalities(id);
alter table public.audit_logs add column if not exists municipality_id uuid references public.municipalities(id);

create index if not exists idx_profiles_municipality_id on public.profiles(municipality_id);
create index if not exists idx_patients_municipality_id on public.patients(municipality_id);
create index if not exists idx_drivers_municipality_id on public.drivers(municipality_id);
create index if not exists idx_vehicles_municipality_id on public.vehicles(municipality_id);
create index if not exists idx_health_units_municipality_id on public.health_units(municipality_id);
create index if not exists idx_transport_requests_municipality_id on public.transport_requests(municipality_id);
create index if not exists idx_trips_municipality_id on public.trips(municipality_id);
create index if not exists idx_trip_passengers_municipality_id on public.trip_passengers(municipality_id);
create index if not exists idx_mileage_records_municipality_id on public.mileage_records(municipality_id);
create index if not exists idx_fuelings_municipality_id on public.fuelings(municipality_id);
create index if not exists idx_maintenances_municipality_id on public.maintenances(municipality_id);
create index if not exists idx_occurrences_municipality_id on public.occurrences(municipality_id);
create index if not exists idx_audit_logs_municipality_id on public.audit_logs(municipality_id);

insert into public.municipalities (id, name)
values ('ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca', 'Prefeitura Principal')
on conflict (id) do nothing;

update public.patients set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.drivers set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.vehicles set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.health_units set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.transport_requests set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.trips set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.trip_passengers set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.mileage_records set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.fuelings set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.maintenances set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.occurrences set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
update public.audit_logs set municipality_id = 'ffd39cd4-ebea-4f0f-b40b-d1a3fd65eeca' where municipality_id is null;
