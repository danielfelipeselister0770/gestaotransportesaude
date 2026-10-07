create table if not exists public.sus_export_batches (
  id uuid primary key default gen_random_uuid(),
  municipality_id uuid not null references public.municipalities(id),
  competence text not null check (competence ~ '^[0-9]{6}$'),
  production_type text not null check (production_type in ('BPA_C','BPA_I','TFD')),
  status text not null default 'OPEN' check (status in ('OPEN','EXPORTED','CANCELLED')),
  record_count integer not null default 0 check (record_count >= 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  exported_at timestamptz
);

alter table public.sus_export_batches enable row level security;

create index if not exists sus_export_batches_municipality_competence_idx
  on public.sus_export_batches(municipality_id, competence desc);

drop policy if exists sus_export_batches_select on public.sus_export_batches;
create policy sus_export_batches_select on public.sus_export_batches
for select to authenticated
using (
  private.current_user_role() = 'ADMIN'
  or municipality_id = private.current_user_municipality_id()
);

drop policy if exists sus_export_batches_manage on public.sus_export_batches;
create policy sus_export_batches_manage on public.sus_export_batches
for all to authenticated
using (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() in ('GESTOR','OPERADOR')
    and municipality_id = private.current_user_municipality_id()
  )
)
with check (
  private.current_user_role() = 'ADMIN'
  or (
    private.current_user_role() in ('GESTOR','OPERADOR')
    and municipality_id = private.current_user_municipality_id()
  )
);

alter table public.sus_production
  add column if not exists export_batch_id uuid references public.sus_export_batches(id);

create index if not exists sus_production_export_batch_idx
  on public.sus_production(export_batch_id);
