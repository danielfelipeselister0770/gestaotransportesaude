drop policy if exists "patients_select" on public.patients;
drop policy if exists "patients_insert" on public.patients;
drop policy if exists "patients_update" on public.patients;

create or replace function private.is_valid_cpf(p_cpf text)
returns boolean
language plpgsql
immutable
set search_path = ''
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

create or replace function private.set_patient_municipality()
returns trigger
language plpgsql
security invoker
set search_path = ''
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

create or replace function private.record_patient_history()
returns trigger
language plpgsql
security invoker
set search_path = ''
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

create or replace function private.touch_patient_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
