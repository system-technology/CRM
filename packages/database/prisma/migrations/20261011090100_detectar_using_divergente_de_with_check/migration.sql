-- =============================================================================
-- Detectar politicas cuyo WITH CHECK DIVERGE de su USING
--
-- Copia literal de prisma/policies/003-politica-canonica.sql. Las politicas se aplican
-- por migracion, nunca a mano; el archivo de policies es la fuente y esta migracion es
-- su aplicacion fechada. Reversible: la vista anterior se recupera reaplicando 001.
-- =============================================================================

-- =============================================================================
-- La política tiene que ser la MISMA a los dos lados — el punto ciego de 001
--
-- Hallazgo propio de la pasada anterior: quitar `WITH CHECK` dejando `USING` NO rompe
-- nada, porque PostgreSQL reutiliza la expresión de `USING` cuando no se declara
-- `WITH CHECK`, y `pg_policy.polwithcheck` queda en NULL pero el comportamiento sigue
-- siendo correcto. La vista `tablas_sin_aislamiento` solo miraba ese NULL.
--
-- El agujero que quedaba señalado es el contrario y es el peligroso: una política con
-- `WITH CHECK` presente pero DISTINTO de `USING` —el caso límite, `WITH CHECK (true)`—
-- pasa todas las comprobaciones de catálogo existentes. `polwithcheck` no es NULL, la
-- política `tenant_isolation` existe, RLS está habilitada y forzada. Y sin embargo
-- cualquier tenant puede INSERTAR filas con el `tenant_id` de otro: las escribe, no las
-- ve, y la otra agencia sí. Una inyección de datos entre agencias con el catálogo en
-- verde.
--
-- Esto lo cierra comparando el TEXTO de las dos expresiones contra una sola forma
-- canónica, que es la que escribe `aplicar_aislamiento_tenant`. Si alguien edita una
-- política a mano —o una migración futura la reescribe de otra manera—, la vista lo
-- marca y la prueba de aislamiento se pone roja.
--
-- Comparar texto normalizado y no árboles es deliberado: es exactamente la propiedad
-- que se quiere («la política es la que esta plantilla escribe, letra por letra»), y
-- cualquier variante equivalente pero escrita distinta MERECE una revisión humana.
-- =============================================================================

-- La forma canónica, deducida del catálogo y no escrita a mano dos veces: se toma la
-- expresión `USING` de una tabla sana. Escribirla como literal aquí la habría puesto a
-- divergir de `aplicar_aislamiento_tenant` el día que esa función cambie — que es el
-- mismo fallo de «dos listas» que ADR-0008 ya tuvo que corregir una vez.
CREATE OR REPLACE FUNCTION politica_canonica_tenant()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT pg_get_expr(p.polqual, p.polrelid)
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  WHERE p.polname = 'tenant_isolation' AND c.relname = 'contactos'
$$;

COMMENT ON FUNCTION politica_canonica_tenant() IS
  'La expresion de aislamiento tal como la escribe aplicar_aislamiento_tenant. Referencia unica para detectar politicas divergentes.';

REVOKE ALL ON FUNCTION politica_canonica_tenant() FROM PUBLIC;

-- La vista se redefine ENTERA (no se puede añadir una columna a una vista existente con
-- CREATE OR REPLACE si cambia el tipo de las anteriores; aquí no cambia ninguna, solo se
-- amplía el CASE). Todo lo anterior se conserva palabra por palabra; lo nuevo son las
-- dos ramas del final.
CREATE OR REPLACE VIEW tablas_sin_aislamiento AS
WITH RECURSIVE raices AS (
  SELECT c.oid, c.relname AS raiz
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  UNION ALL
  SELECT h.inhrelid, r.raiz
  FROM pg_inherits h
  JOIN raices r ON r.oid = h.inhparent
)
SELECT
  c.relname AS tabla,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
        AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN 'sin columna tenant_id'
    WHEN NOT c.relrowsecurity  THEN 'RLS no habilitada'
    WHEN NOT c.relforcerowsecurity THEN 'RLS no forzada (el dueño se la salta)'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
    ) THEN 'sin política tenant_isolation'
    WHEN EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        AND p.polwithcheck IS NULL
    ) THEN 'política sin WITH CHECK: permite escribir filas de otro tenant'
    -- NUEVO — el punto ciego: USING correcto y WITH CHECK distinto.
    WHEN EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        AND pg_get_expr(p.polqual, p.polrelid) IS DISTINCT FROM politica_canonica_tenant()
    ) THEN 'USING no es la expresión canónica de aislamiento'
    WHEN EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        AND pg_get_expr(p.polwithcheck, p.polrelid) IS DISTINCT FROM pg_get_expr(p.polqual, p.polrelid)
    ) THEN 'WITH CHECK DIVERGE de USING: se puede escribir en otro tenant lo que no se puede leer'
    -- Una política que no sea PERMISSIVE FOR ALL deja agujeros por comando: una
    -- RESTRICTIVE sola no concede nada, y una FOR SELECT deja INSERT sin filtro.
    WHEN EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        AND (p.polcmd <> '*' OR NOT p.polpermissive)
    ) THEN 'la política no es PERMISSIVE FOR ALL: deja comandos sin filtrar'
    ELSE NULL
  END AS problema
FROM raices r
JOIN pg_class c ON c.oid = r.oid
WHERE
  NOT EXISTS (SELECT 1 FROM excepciones_rls e WHERE e.tabla = r.raiz);

COMMENT ON VIEW tablas_sin_aislamiento IS
  'Filas = defectos de aislamiento. Debe estar vacia. Desde 003 detecta tambien USING divergente de WITH CHECK.';
