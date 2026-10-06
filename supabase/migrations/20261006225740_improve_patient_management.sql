create or replace function private.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
as $$
declare
  digits text := regexp_replace(coalesce(p_cpf, ''), '\\D', '', 'g');
  sum1 integer := 0;
  sum2 integer := 0;
  i integer;
  d1 integer;
  d2 integer;
begin
  if digits = '' then return true; end if;
  if length(digits) <> 11 then return false; end if;
  if digits ~ '^(\\d)\\1{10}$' then return false; end if;
  for i in 1..9 loop
    sum1 := sum1 + substring(digits, i, 1)::integer * (11 - i);
  end loop;
  d1 := (sum1 * 10) % 11;
  if d1 = 10 then d1 := 0; end if;
  if d1 <> substring(digits, 10, 1)::integer then return false; end if;
  for i in 1..10 loop
    sum2 := sum2 + substring(digits, i, 1)::integer * (12 - i);
  end loop;
  d2 := (sum2 * 10) % 11;
  if d2 = 10 then d2 := 0; end if;
  return d2 = substring(digits, 11, 1)::integer;
end;
$$;

alter table public.patients
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deactivated_at timestamptz;

alter table public.patients
  drop constraint if exists patients_cpf_format_check;

alter table public.patients
  add constraint patients_cpf_format_check
  check (cpf is null or private.is_valid_cpf(cpf));

create unique index if not exists patients_municipality_cpf_unique_idx
  on public.patients (municipality_id, cpf)
  where cpf is not null;

create unique index if not exists patients_municipality_cns_unique_idx
  on public.patients (municipality_id, cns)
  where cns is not null;

create index if not exists patients_municipality_name_idx
  on public.patients (municipality_id, name);

create index if not exists patients_municipality_phone_idx
  on public.patients (municipality_id, phone);

create index if not exists patients_municipality_active_idx
  on public.patients (municipality_id, active);

create table if not exists public.patient_history (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  municipality_id uuid not null references public.municipalities(id),
  user_id uuid references public.profiles(id),
  action text not null check (action in ('CREATED','UPDATED','DEACTIVATED','REACTIVATED')),
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

alter table public.patient_history enable row level security;

grant select, insert on public.patient_history to authenticated;

drop policy if exists "patient_history_select_same_municipality" on public.patient_history;
create policy "patient_history_select_same_municipality"
on public.patient_history
for select
to authenticated
using ((select private.current_user_municipality_id()) = municipality_id);

drop policy if exists "patient_history_insert_same_municipality" on public.patient_history;
create policy "patient_history_insert_same_municipality"
on public.patient_history
for insert
to authenticated
with check (
  (select private.current_user_municipality_id()) = municipality_id
  and user_id = (select auth.uid())
);

create index if not exists patient_history_patient_idx
  on public.patient_history (patient_id, changed_at desc);

create index if not exists patient_history_municipality_idx
  on public.patient_history (municipality_id, changed_at desc);

create or replace function private.set_patient_municipality()
returns trigger
language plpgsql
security invoker
as $$
declare
  current_municipality uuid;
begin
  current_municipality := (select private.current_user_municipality_id());
  if current_municipality is not null then
    if tg_op = 'INSERT' or new.municipality_id is null then
      new.municipality_id := current_municipality;
    elsif new.municipality_id <> current_municipality then
      raise exception 'Paciente pertence a outra prefeitura.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_set_municipality on public.patients;
create trigger patients_set_municipality
before insert or update on public.patients
for each row execute function private.set_patient_municipality();

create or replace function private.record_patient_history()
returns trigger
language plpgsql
security invoker
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_municipality uuid := coalesce(new.municipality_id, old.municipality_id);
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'CREATED';
  elsif tg_op = 'UPDATE' then
    if old.active = true and new.active = false then
      action_name := 'DEACTIVATED';
    elsif old.active = false and new.active = true then
      action_name := 'REACTIVATED';
    else
      action_name := 'UPDATED';
    end if;
  else
    action_name := 'UPDATED';
  end if;
  insert into public.patient_history(patient_id, municipality_id, user_id, action, old_data, new_data)
  values (
    coalesce(new.id, old.id),
    current_municipality,
    current_user_id,
    action_name,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists patients_record_history on public.patients;
create trigger patients_record_history
after insert or update on public.patients
for each row execute function private.record_patient_history();

create or replace function private.touch_patient_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at
before update on public.patients
for each row execute function private.touch_patient_updated_at();

drop policy if exists "patients_select_same_municipality" on public.patients;
create policy "patients_select_same_municipality"
on public.patients
for select
to authenticated
using ((select private.current_user_municipality_id()) = municipality_id);

drop policy if exists "patients_insert_same_municipality" on public.patients;
create policy "patients_insert_same_municipality"
on public.patients
for insert
to authenticated
with check ((select private.current_user_municipality_id()) = municipality_id);

drop policy if exists "patients_update_same_municipality" on public.patients;
create policy "patients_update_same_municipality"
on public.patients
for update
to authenticated
using ((select private.current_user_municipality_id()) = municipality_id)
with check ((select private.current_user_municipality_id()) = municipality_id);
