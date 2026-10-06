alter table public.patients
  add column if not exists cns text,
  add column if not exists sex text,
  add column if not exists nationality text,
  add column if not exists race_color text,
  add column if not exists ethnicity text,
  add column if not exists cep text,
  add column if not exists residence_municipality text,
  add column if not exists residence_municipality_ibge text,
  add column if not exists street text,
  add column if not exists street_number text,
  add column if not exists neighborhood text,
  add column if not exists address_complement text;

alter table public.patients
  add constraint patients_cns_format_check
    check (cns is null or cns ~ '^[0-9]{15}$'),
  add constraint patients_cep_format_check
    check (cep is null or cep ~ '^[0-9]{8}$'),
  add constraint patients_residence_ibge_format_check
    check (residence_municipality_ibge is null or residence_municipality_ibge ~ '^[0-9]{7}$'),
  add constraint patients_sex_check
    check (sex is null or sex in ('MASCULINO','FEMININO','IGNORADO')),
  add constraint patients_nationality_check
    check (nationality is null or nationality in ('BRASILEIRA','NATURALIZADA','ESTRANGEIRA')),
  add constraint patients_race_color_check
    check (race_color is null or race_color in ('BRANCA','PRETA','PARDA','AMARELA','INDIGENA','SEM_DECLARACAO'));

create index if not exists patients_municipality_cns_idx
  on public.patients (municipality_id, cns)
  where cns is not null;

comment on column public.patients.cns is 'CNS do paciente, armazenado somente com dígitos; necessário conforme regras do procedimento SUS.';
comment on column public.patients.residence_municipality_ibge is 'Código IBGE de 7 dígitos do município de residência do paciente.';
comment on column public.patients.race_color is 'Raça/cor conforme domínio padronizado para preparação de produção SUS.';
comment on column public.patients.ethnicity is 'Etnia, quando aplicável, especialmente para raça/cor indígena.';
