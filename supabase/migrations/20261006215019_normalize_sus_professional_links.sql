create table if not exists public.health_professional_links (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  professional_id uuid not null references public.health_professionals(id) on delete cascade,
  health_unit_id uuid not null references public.health_units(id) on delete restrict,
  cbo text,
  active boolean not null default true,
  responsible_for_production boolean not null default false,
  vinculation text,
  vinculation_subtype text,
  sus boolean not null default true,
  hours_other numeric(6,2),
  hours_ambulatory numeric(6,2),
  hours_hospital numeric(6,2),
  valid_from date,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint health_professional_links_cbo_format_chk check (cbo is null or cbo ~ '^[0-9]{6}$'),
  constraint health_professional_links_hours_chk check (
    coalesce(hours_other,0) >= 0 and coalesce(hours_ambulatory,0) >= 0 and coalesce(hours_hospital,0) >= 0
  )
);

insert into public.health_professional_links (
  municipality_id, professional_id, health_unit_id, cbo, active,
  responsible_for_production
)
select p.municipality_id, p.id, p.health_unit_id, p.cbo, p.active, p.responsible_for_production
from public.health_professionals p
where p.health_unit_id is not null
  and not exists (
    select 1
    from public.health_professional_links l
    where l.professional_id = p.id
      and l.health_unit_id = p.health_unit_id
      and l.cbo is not distinct from p.cbo
  );

create index if not exists health_professional_links_municipality_active_idx
  on public.health_professional_links(municipality_id, active);
create index if not exists health_professional_links_professional_idx
  on public.health_professional_links(professional_id);
create index if not exists health_professional_links_health_unit_idx
  on public.health_professional_links(health_unit_id);

create unique index if not exists health_professional_links_unique_professional_unit_cbo_idx
  on public.health_professional_links(professional_id, health_unit_id, cbo)
  where cbo is not null;

create or replace function private.validate_health_professional_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.health_professionals p
    where p.id = new.professional_id
      and p.municipality_id = new.municipality_id
  ) then
    raise exception 'O profissional não pertence à prefeitura informada';
  end if;

  if not exists (
    select 1 from public.health_units u
    where u.id = new.health_unit_id
      and u.municipality_id = new.municipality_id
  ) then
    raise exception 'O estabelecimento não pertence à prefeitura informada';
  end if;

  if new.valid_to is not null and new.valid_from is not null and new.valid_to < new.valid_from then
    raise exception 'A validade final não pode ser anterior à validade inicial';
  end if;

  return new;
end;
$$;

drop trigger if exists health_professional_links_validate on public.health_professional_links;
create trigger health_professional_links_validate
before insert or update on public.health_professional_links
for each row execute function private.validate_health_professional_link();

drop trigger if exists health_professional_links_set_updated_at on public.health_professional_links;
create trigger health_professional_links_set_updated_at
before update on public.health_professional_links
for each row execute function private.set_updated_at();

alter table public.health_professional_links enable row level security;

drop policy if exists health_professional_links_select on public.health_professional_links;
create policy health_professional_links_select on public.health_professional_links
for select using (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() in ('GESTOR','OPERADOR')
    and municipality_id = private.current_user_municipality_id()
  )
);

drop policy if exists health_professional_links_insert on public.health_professional_links;
create policy health_professional_links_insert on public.health_professional_links
for insert with check (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() = 'GESTOR'
    and municipality_id = private.current_user_municipality_id()
  )
);

drop policy if exists health_professional_links_update on public.health_professional_links;
create policy health_professional_links_update on public.health_professional_links
for update using (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() = 'GESTOR'
    and municipality_id = private.current_user_municipality_id()
  )
) with check (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() = 'GESTOR'
    and municipality_id = private.current_user_municipality_id()
  )
);

drop policy if exists health_professional_links_delete on public.health_professional_links;
create policy health_professional_links_delete on public.health_professional_links
for delete using (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() = 'GESTOR'
    and municipality_id = private.current_user_municipality_id()
  )
);

grant select, insert, update, delete on public.health_professional_links to authenticated;

alter table public.health_professionals
  drop constraint if exists health_professionals_cbo_format_chk,
  drop constraint if exists health_professionals_health_unit_id_fkey;

alter table public.health_professionals
  drop column if exists health_unit_id,
  drop column if exists cbo,
  drop column if exists responsible_for_production;

create index if not exists health_professionals_municipality_active_idx
  on public.health_professionals(municipality_id, active);
