alter table public.drivers add column if not exists profile_id uuid unique references public.profiles(id);
alter table public.drivers add column if not exists manager_id uuid references public.profiles(id);
create index if not exists idx_drivers_profile_id on public.drivers(profile_id);
create index if not exists idx_drivers_manager_id on public.drivers(manager_id);
