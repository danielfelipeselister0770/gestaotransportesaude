ALTER TABLE public.health_units
  ADD COLUMN IF NOT EXISTS cnes text,
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS subtype text,
  ADD COLUMN IF NOT EXISTS management text,
  ADD COLUMN IF NOT EXISTS is_secretariat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.health_units
  DROP CONSTRAINT IF EXISTS health_units_cnes_format_check,
  DROP CONSTRAINT IF EXISTS health_units_cnpj_format_check;

ALTER TABLE public.health_units
  ADD CONSTRAINT health_units_cnes_format_check
    CHECK (cnes IS NULL OR cnes ~ '^[0-9]{7}$'),
  ADD CONSTRAINT health_units_cnpj_format_check
    CHECK (cnpj IS NULL OR cnpj ~ '^[0-9]{14}$');

CREATE UNIQUE INDEX IF NOT EXISTS health_units_municipality_cnes_uidx
  ON public.health_units (municipality_id, cnes)
  WHERE cnes IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS health_units_one_secretariat_uidx
  ON public.health_units (municipality_id)
  WHERE is_secretariat = true;

CREATE INDEX IF NOT EXISTS health_units_municipality_active_idx
  ON public.health_units (municipality_id, active);

DROP TRIGGER IF EXISTS health_units_set_updated_at ON public.health_units;
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER health_units_set_updated_at
BEFORE UPDATE ON public.health_units
FOR EACH ROW
EXECUTE FUNCTION private.set_updated_at();

ALTER TABLE public.health_units ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.health_units IS 'Estabelecimentos de saúde vinculados a uma prefeitura; inclui identificação CNES e permite marcar a Secretaria Municipal de Saúde.';
COMMENT ON COLUMN public.health_units.cnes IS 'Código CNES do estabelecimento, quando aplicável.';
COMMENT ON COLUMN public.health_units.is_secretariat IS 'Indica o estabelecimento que representa a Secretaria Municipal de Saúde no contexto da prefeitura.';
