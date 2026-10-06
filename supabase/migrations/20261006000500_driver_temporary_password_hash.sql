alter table public.drivers
  add column if not exists temporary_password_hash text;
