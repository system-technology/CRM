-- =============================================================================
-- Aislamiento entre tenants — Row Level Security
--
-- Regla R1 y ADR-0003. Esta es la propiedad número uno del producto: que una agencia
-- vea datos de otra no es un bug, es el fin del negocio.
--
-- La diferencia esencial con filtrar en la aplicación: aquí, **olvidar el filtro no
-- produce una fuga, produce cero filas**. El fallo es seguro por defecto.
--
-- Se aplica por migración, nunca a mano.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Aplicar la política a una tabla
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aplicar_aislamiento_tenant(nombre_tabla text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- FORCE incluye al dueño de la tabla. Sin él, el rol propietario se la salta.
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nombre_tabla);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nombre_tabla);

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', nombre_tabla);

  -- WITH CHECK NO es opcional. Sin él, un tenant puede ESCRIBIR filas con el
  -- tenant_id de otro, aunque luego no pueda leerlas. Es el error clásico.
  EXECUTE format($politica$
    CREATE POLICY tenant_isolation ON %I
      USING      (tenant_id = current_setting('app.current_tenant', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid)
  $politica$, nombre_tabla);
END;
$$;

COMMENT ON FUNCTION aplicar_aislamiento_tenant(text) IS
  'Habilita y fuerza RLS en una tabla de negocio, con política de aislamiento por tenant.';

-- -----------------------------------------------------------------------------
-- 2. Aplicarla a todas las tablas de negocio
--
-- Dirigido por datos: toda tabla que tenga una columna `tenant_id` recibe la política.
-- Así una tabla nueva queda protegida sin que nadie tenga que acordarse de añadirla
-- a una lista — y acordarse es justo lo que falla.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    PERFORM aplicar_aislamiento_tenant(t.tabla);
    RAISE NOTICE 'RLS aplicada a %', t.tabla;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Detectar tablas desprotegidas
--
-- La usa la prueba de aislamiento en CI. Si devuelve filas, hay un defecto bloqueante:
-- o a una tabla de negocio le falta la política, o hay una tabla global sin declarar
-- como excepción.
--
-- Las excepciones están documentadas una por una en
-- docs/02-arquitectura/03-modelo-de-datos.md §4.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW tablas_sin_aislamiento AS
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
    ELSE NULL
  END AS problema
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  -- Excepciones declaradas. Cada una justificada en el modelo de datos.
  AND c.relname NOT IN ('tenants', 'monedas', '_prisma_migrations');

COMMENT ON VIEW tablas_sin_aislamiento IS
  'Filas = defectos de aislamiento. Debe estar vacía. La verifica la prueba de CI.';

-- -----------------------------------------------------------------------------
-- 4. Permisos del rol de aplicación
--
-- R2: la aplicación entra con viajapro_app, que NO puede saltarse RLS.
-- Las migraciones sí usan el rol propietario, y solo ellas.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app') THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO viajapro_app';
    EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO viajapro_app';
  ELSE
    RAISE NOTICE 'El rol viajapro_app no existe; se omiten los GRANT.';
  END IF;
END;
$$;
