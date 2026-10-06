DROP POLICY IF EXISTS health_units_insert ON public.health_units;
CREATE POLICY health_units_insert ON public.health_units
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT private.current_user_role()) = 'ADMIN'::user_role
  OR (
    (SELECT private.current_user_role()) = 'GESTOR'::user_role
    AND municipality_id = (SELECT private.current_user_municipality_id())
  )
);

DROP POLICY IF EXISTS health_units_update ON public.health_units;
CREATE POLICY health_units_update ON public.health_units
FOR UPDATE TO authenticated
USING (
  (SELECT private.current_user_role()) = 'ADMIN'::user_role
  OR (
    (SELECT private.current_user_role()) = 'GESTOR'::user_role
    AND municipality_id = (SELECT private.current_user_municipality_id())
  )
)
WITH CHECK (
  (SELECT private.current_user_role()) = 'ADMIN'::user_role
  OR (
    (SELECT private.current_user_role()) = 'GESTOR'::user_role
    AND municipality_id = (SELECT private.current_user_municipality_id())
  )
);

DROP POLICY IF EXISTS health_units_delete ON public.health_units;
CREATE POLICY health_units_delete ON public.health_units
FOR DELETE TO authenticated
USING (
  (SELECT private.current_user_role()) = 'ADMIN'::user_role
  OR (
    (SELECT private.current_user_role()) = 'GESTOR'::user_role
    AND municipality_id = (SELECT private.current_user_municipality_id())
  )
);
