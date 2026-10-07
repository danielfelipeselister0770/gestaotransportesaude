alter table public.transport_requests
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists cancellation_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists denial_reason text,
  add column if not exists denied_at timestamptz,
  add column if not exists denied_by uuid references public.profiles(id);

create table if not exists public.transport_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.transport_requests(id) on delete cascade,
  municipality_id uuid not null references public.municipalities(id),
  user_id uuid references public.profiles(id),
  action text not null check (action in ('CREATED','UPDATED','STATUS_CHANGED')),
  old_status public.request_status,
  new_status public.request_status,
  old_data jsonb,
  new_data jsonb,
  note text,
  changed_at timestamptz not null default now()
);
alter table public.transport_request_history enable row level security;
revoke all on table public.transport_request_history from anon, authenticated;
grant select on table public.transport_request_history to authenticated;
drop policy if exists "request_history_select_same_municipality" on public.transport_request_history;
create policy "request_history_select_same_municipality" on public.transport_request_history for select to authenticated
using ((select private.current_user_role())='ADMIN'::public.user_role or municipality_id=(select private.current_user_municipality_id()));
create index if not exists transport_request_history_request_idx on public.transport_request_history(request_id,changed_at desc);
create index if not exists transport_request_history_municipality_idx on public.transport_request_history(municipality_id,changed_at desc);
create index if not exists transport_requests_municipality_date_status_idx on public.transport_requests(municipality_id,date,status);
create index if not exists transport_requests_health_unit_idx on public.transport_requests(health_unit_id);

create or replace function private.touch_transport_request_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end; $$;
drop trigger if exists transport_requests_touch_updated_at on public.transport_requests;
create trigger transport_requests_touch_updated_at before update on public.transport_requests for each row execute function private.touch_transport_request_updated_at();

create or replace function private.set_transport_request_municipality() returns trigger language plpgsql security invoker set search_path='' as $$
declare m uuid; begin m:=(select private.current_user_municipality_id()); if m is not null then if tg_op='INSERT' or new.municipality_id is null then new.municipality_id:=m; elsif new.municipality_id<>m and (select private.current_user_role())<>'ADMIN'::public.user_role then raise exception 'Solicitação pertence a outra prefeitura.'; end if; end if; return new; end; $$;
drop trigger if exists transport_requests_set_municipality on public.transport_requests;
create trigger transport_requests_set_municipality before insert or update on public.transport_requests for each row execute function private.set_transport_request_municipality();

create or replace function private.validate_transport_request_change() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.status in ('COMPLETED','CANCELLED','DENIED','NO_SHOW') and (new.patient_id,new.date,new.time,new.origin,new.destination,new.health_unit_id,new.purpose,new.needs_companion,new.observations) is distinct from (old.patient_id,old.date,old.time,old.origin,old.destination,old.health_unit_id,old.purpose,old.needs_companion,old.observations) then raise exception 'Solicitação finalizada não pode ter dados operacionais alterados.'; end if;
  if new.status is distinct from old.status and not ((old.status='REQUESTED' and new.status in ('APPROVED','DENIED','CANCELLED')) or (old.status='APPROVED' and new.status in ('SCHEDULED','CANCELLED')) or (old.status='SCHEDULED' and new.status in ('COMPLETED','NO_SHOW','CANCELLED'))) then raise exception 'Transição de status inválida: % -> %',old.status,new.status; end if;
 end if;
 if new.status='APPROVED' and (new.approved_by is null or new.approved_at is null) then raise exception 'A aprovação exige usuário e data de aprovação.'; end if;
 if new.status='CANCELLED' and nullif(btrim(new.cancellation_reason),'') is null then raise exception 'Informe o motivo do cancelamento.'; end if;
 if new.status='DENIED' and nullif(btrim(new.denial_reason),'') is null then raise exception 'Informe o motivo da negativa.'; end if;
 return new;
end; $$;
drop trigger if exists transport_requests_validate_change on public.transport_requests;
create trigger transport_requests_validate_change before insert or update on public.transport_requests for each row execute function private.validate_transport_request_change();

create or replace function private.record_transport_request_history() returns trigger language plpgsql security definer set search_path='' as $$
declare a text; n text; begin if tg_op='INSERT' then a:='CREATED'; elsif new.status is distinct from old.status then a:='STATUS_CHANGED'; else a:='UPDATED'; end if; if new.status='CANCELLED' then n:=new.cancellation_reason; elsif new.status='DENIED' then n:=new.denial_reason; end if; insert into public.transport_request_history(request_id,municipality_id,user_id,action,old_status,new_status,old_data,new_data,note) values(new.id,new.municipality_id,(select auth.uid()),a,case when tg_op='UPDATE' then old.status end,new.status,case when tg_op='UPDATE' then to_jsonb(old) end,to_jsonb(new),n); return new; end; $$;
revoke all on function private.record_transport_request_history() from public;
grant execute on function private.record_transport_request_history() to authenticated;
drop trigger if exists transport_requests_record_history on public.transport_requests;
create trigger transport_requests_record_history after insert or update on public.transport_requests for each row execute function private.record_transport_request_history();
drop policy if exists "requests_select" on public.transport_requests;
drop policy if exists "requests_insert" on public.transport_requests;
drop policy if exists "requests_update" on public.transport_requests;