alter table public.sus_export_batches
  add constraint sus_export_batches_id_municipality_key unique (id, municipality_id);

alter table public.sus_production
  drop constraint if exists sus_production_export_batch_id_fkey;

alter table public.sus_production
  add constraint sus_production_export_batch_municipality_fkey
  foreign key (export_batch_id, municipality_id)
  references public.sus_export_batches(id, municipality_id);

create or replace function private.validate_sus_production_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type text;
  v_competence text;
  v_status text;
begin
  if new.export_batch_id is null then return new; end if;
  select b.production_type,b.competence,b.status into v_type,v_competence,v_status
  from public.sus_export_batches b
  where b.id=new.export_batch_id and b.municipality_id=new.municipality_id;
  if v_type is null then raise exception 'Lote de exportação inválido para esta prefeitura'; end if;
  if v_status <> 'OPEN' then raise exception 'Somente lotes abertos podem receber produções'; end if;
  if new.production_type <> v_type then raise exception 'Tipo da produção não corresponde ao tipo do lote'; end if;
  if to_char(new.production_date,'YYYYMM') <> v_competence then raise exception 'Competência da produção não corresponde à competência do lote'; end if;
  return new;
end;
$$;

drop trigger if exists validate_sus_production_batch_trigger on public.sus_production;
create trigger validate_sus_production_batch_trigger
before insert or update of export_batch_id, municipality_id, production_type, production_date
on public.sus_production
for each row execute function private.validate_sus_production_batch();
