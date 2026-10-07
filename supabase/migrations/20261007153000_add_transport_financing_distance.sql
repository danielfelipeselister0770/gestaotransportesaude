alter table public.transport_requests
  add column if not exists financing_distance_km numeric(10,2);
alter table public.transport_requests
  drop constraint if exists transport_requests_financing_distance_km_check;
alter table public.transport_requests
  add constraint transport_requests_financing_distance_km_check
  check (financing_distance_km is null or financing_distance_km > 0);
comment on column public.transport_requests.financing_distance_km is
'Distância de referência em km usada para enquadramento nas regras de financiamento do transporte SUS; não corresponde automaticamente ao odômetro da viagem.';
