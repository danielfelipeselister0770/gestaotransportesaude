create or replace function private.validate_sus_production_tenant_links()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.patient_id is not null and not exists(select 1 from public.patients p where p.id=new.patient_id and p.municipality_id=new.municipality_id) then raise exception 'Paciente pertence a outra prefeitura'; end if;
  if new.request_id is not null and not exists(select 1 from public.transport_requests r where r.id=new.request_id and r.municipality_id=new.municipality_id) then raise exception 'Solicitação pertence a outra prefeitura'; end if;
  if new.health_unit_id is not null and not exists(select 1 from public.health_units h where h.id=new.health_unit_id and h.municipality_id=new.municipality_id) then raise exception 'Estabelecimento pertence a outra prefeitura'; end if;
  if new.professional_link_id is not null and not exists(select 1 from public.health_professional_links l join public.health_units h on h.id=l.health_unit_id where l.id=new.professional_link_id and h.municipality_id=new.municipality_id) then raise exception 'Vínculo profissional pertence a outra prefeitura'; end if;
  return new;
end $$;
drop trigger if exists validate_sus_production_tenant_links_trigger on public.sus_production;
create trigger validate_sus_production_tenant_links_trigger before insert or update of municipality_id,patient_id,request_id,health_unit_id,professional_link_id on public.sus_production for each row execute function private.validate_sus_production_tenant_links();
