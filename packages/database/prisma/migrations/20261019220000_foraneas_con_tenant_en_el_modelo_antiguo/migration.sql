-- =============================================================================
-- El tenant entra en las tres foráneas simples que quedaban de la migración inicial
--
-- `paquetes -> mayoristas`, `temporadas -> paquetes` y `precios -> temporadas` nacieron simples
-- el 2026-10-07 y sobrevivieron a 20261013230000, que arregló las del catálogo nuevo
-- (`vigencias`, `tarifas`) y dejó estas fuera. Mismo defecto, mismo ataque: la integridad
-- referencial se evalúa POR ENCIMA de RLS, así que el `WITH CHECK` valida el `tenant_id` de la
-- fila nueva y nadie valida el del padre. Con una foránea simple, una agencia puede colgar un
-- paquete SUYO del mayorista de otra, o un precio suyo de la temporada de otra; y con la cascada,
-- la otra agencia borra su temporada y se lleva por delante filas de dinero que nunca pudo ver.
--
-- `temporadas` y `precios` siguen vivos —los leen `cotizar-paquete` y `listar-paquetes`—, aunque
-- el cotizador nuevo (ADR-0009) va por `vigencias` y `tarifas`. No se borran aquí.
--
-- La aserción 54 de `aislamiento.spec.ts` barre el catálogo entero en busca de foráneas así; el
-- bloque del final de este archivo hace lo mismo y tumba el despliegue si queda alguna.
--
-- Reversible: devolver las tres foráneas a su forma simple y borrar `temporadas_id_tenant_id_key`.
-- No se hace nunca, porque reabre el cruce.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El destino que la foránea compuesta necesita
--
-- `paquetes_id_tenant_id_key` y `mayoristas_id_tenant_id_key` ya existen (20261010210000 y
-- 20261013230000). Falta el de `temporadas`.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "temporadas_id_tenant_id_key" ON "temporadas" ("id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 2. `paquetes` -> `mayoristas`
--
-- Era `ON DELETE SET NULL`, y sobre una clave compuesta un `SET NULL` a secas anula TODAS sus
-- columnas, `tenant_id` incluido, que es NOT NULL: el defecto de 20261011090200. Se nombra la
-- columna, como en `mensajes_cotizacion_id_tenant_id_fkey`.
--
-- `ON UPDATE RESTRICT` y no `CASCADE`: con el tenant dentro de la clave, una cascada de UPDATE
-- arrastraría a los hijos de una agencia a otra si alguien cambiase el `tenant_id` del padre.
-- -----------------------------------------------------------------------------
ALTER TABLE "paquetes" DROP CONSTRAINT IF EXISTS "paquetes_mayorista_id_fkey";

ALTER TABLE "paquetes"
  ADD CONSTRAINT "paquetes_mayorista_id_tenant_id_fkey"
  FOREIGN KEY ("mayorista_id", "tenant_id") REFERENCES "mayoristas" ("id", "tenant_id")
  ON DELETE SET NULL ("mayorista_id") ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. `temporadas` -> `paquetes`
-- -----------------------------------------------------------------------------
ALTER TABLE "temporadas" DROP CONSTRAINT IF EXISTS "temporadas_paquete_id_fkey";

ALTER TABLE "temporadas"
  ADD CONSTRAINT "temporadas_paquete_id_tenant_id_fkey"
  FOREIGN KEY ("paquete_id", "tenant_id") REFERENCES "paquetes" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 4. `precios` -> `temporadas`
-- -----------------------------------------------------------------------------
ALTER TABLE "precios" DROP CONSTRAINT IF EXISTS "precios_temporada_id_fkey";

ALTER TABLE "precios"
  ADD CONSTRAINT "precios_temporada_id_tenant_id_fkey"
  FOREIGN KEY ("temporada_id", "tenant_id") REFERENCES "temporadas" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 5. Comprobación sobre TODO el esquema, no solo sobre estas tres
--
-- Toda foránea entre dos tablas con `tenant_id` tiene que emparejar el `tenant_id` de la hija
-- con el del padre, en la misma posición. Es la consulta de la aserción 54.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  simples text;
BEGIN
  SELECT string_agg(DISTINCT t.relname || '.' || c.conname, ', ')
    INTO simples
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute ta ON ta.attrelid = c.conrelid AND ta.attname = 'tenant_id'
                        AND ta.attnum > 0 AND NOT ta.attisdropped
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attname = 'tenant_id'
                        AND pa.attnum > 0 AND NOT pa.attisdropped
   WHERE c.contype = 'f' AND n.nspname = 'public'
     AND NOT EXISTS (
       SELECT 1 FROM generate_subscripts(c.conkey, 1) AS i
        WHERE c.conkey[i] = ta.attnum AND c.confkey[i] = pa.attnum
     );
  IF simples IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan foraneas entre tablas de tenant sin tenant_id -> %', simples;
  END IF;
END;
$$;

SELECT aplicar_aislamiento_tenant('paquetes');
SELECT aplicar_aislamiento_tenant('temporadas');
SELECT aplicar_aislamiento_tenant('precios');
SELECT aplicar_privilegios_declarados();

DO $$
DECLARE
  defectos text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;
END;
$$;
