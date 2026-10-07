create table if not exists public.sus_transport_financing_rules (
  id uuid primary key default gen_random_uuid(),
  treatment_type text not null check (treatment_type in ('HEMODIALYSIS','RADIOTHERAPY')),
  procedure_code text not null,
  min_distance_km numeric(10,2) not null,
  max_distance_km numeric(10,2),
  round_trip_value numeric(10,2) not null,
  valid_from date not null,
  valid_to date,
  legal_basis text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(treatment_type,min_distance_km,valid_from)
);
alter table public.sus_transport_financing_rules enable row level security;
drop policy if exists sus_transport_financing_rules_select on public.sus_transport_financing_rules;
create policy sus_transport_financing_rules_select on public.sus_transport_financing_rules for select to authenticated using (true);
revoke insert, update, delete, truncate on public.sus_transport_financing_rules from authenticated;
insert into public.sus_transport_financing_rules(treatment_type,procedure_code,min_distance_km,max_distance_km,round_trip_value,valid_from,legal_basis) values
('HEMODIALYSIS','0803010168',51,100,25,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V'),
('HEMODIALYSIS','0803010168',101,150,35,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V'),
('HEMODIALYSIS','0803010168',151,null,45,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V'),
('RADIOTHERAPY','0803010150',51,200,50,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V'),
('RADIOTHERAPY','0803010150',201,300,90,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V'),
('RADIOTHERAPY','0803010150',301,400,130,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V'),
('RADIOTHERAPY','0803010150',401,null,170,'2026-05-01','Portaria GM/MS nº 11.164/2026, Anexo V') on conflict do nothing;
