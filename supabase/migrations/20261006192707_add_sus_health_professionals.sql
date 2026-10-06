create table if not exists public.health_professionals (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  health_unit_id uuid references public.health_units(id) on delete restrict,
  name text not null,
  cns text,
  cbo text,
  active boolean not null default true,
  responsible_for_production boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_professionals_cns_format_chk
    check (cns is null or cns ~ '^[0-9]{15}$'),
  constraint health_professionals_cbo_format_chk
    check (cbo is null or cbo ~ '^[0-9]{6}$')
);

create unique index if not exists health_professionals_municipality_cns_uidx
  on public.health_professionals (municipality_id, cns)
  where cns is not null;

create index if not exists health_professionals_municipality_active_idx
  on public.health_professionals (municipality_id, active);

create index if not exists health_professionals_health_unit_idx
  on public.health_professionals (health_unit_id);

drop trigger if exists health_professionals_set_updated_at on public.health_professionals;
create trigger health_professionals_set_updated_at
before update on public.health_professionals
for each row execute function private.set_updated_at();

alter table public.health_professionals enable row level security;

revoke all on table public.health_professionals from anon;
grant select, insert, update, delete on table public.health_professionals to authenticated;

drop policy if exists health_professionals_select on public.health_professionals;
create policy health_professionals_select
on public.health_professionals for select to authenticated
using (
  (select private.current_user_role()) = 'ADMIN'::user_role
  or (
    (select private.current_user_role()) in ('GESTOR'::user_role, 'OPERADOR'::user_role)
    and municipality_id = (select private.current_user_municipality_id())
  )
);

drop policy if exists health_professionals_insert on public.health_professionals;
create policy health_professionals_insert
on public.health_professionals for insert to authenticated
with check (
  (select private.current_user_role()) = 'ADMIN'::user_role
  or (
    (select private.current_user_role()) = 'GESTOR'::user_role
    and municipality_id = (select private.current_user_municipality_id())
  )
);

drop policy if exists health_professionals_update on public.health_professionals;
create policy health_professionals_update
on public.health_professionals for update to authenticated
using (
  (select private.current_user_role()) = 'ADMIN'::user_role
  or (
    (select private.current_user_role()) = 'GESTOR'::user_role
    and municipality_id = (select private.current_user_municipality_id())
  )
)
with check (
  (select private.current_user_role()) = 'ADMIN'::user_role
  or (
    (select private.current_user_role()) = 'GESTOR'::user_role
    and municipality_id = (select private.current_user_municipality_id())
  )
);

drop policy if exists health_professionals_delete on public.health_professionals;
create policy health_professionals_delete
on public.health_professionals for delete to authenticated
using (
  (select private.current_user_role()) = 'ADMIN'::user_role
  or (
    (select private.current_user_role()) = 'GESTOR'::user_role
    and municipality_id = (select private.current_user_municipality_id())
  )
);