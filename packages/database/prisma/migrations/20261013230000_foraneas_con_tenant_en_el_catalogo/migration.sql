-- =============================================================================
-- El tenant entra DENTRO de las claves foráneas del catálogo
--
-- **Esto corrige una afirmación falsa, no solo un riesgo.** La migración de esta mañana dejó las
-- foráneas de `vigencias` y `tarifas` simples y lo justificó así: «Foránea simple, igual que el
-- resto del esquema (…) meterle el tenant dentro es una mejora que vale para TODO el esquema, no
-- para una tabla suelta».
--
-- `auditor-seguridad` lo contó contra la base y es al revés: **38 foráneas compuestas con
-- `tenant_id` contra 6 simples entre tablas de tenant**. Todo `inbox` y todo `crm` ya son
-- compuestas desde el 2026-10-10, y ese módulo tiene dos aserciones —la 29 y la 30— probando
-- justo este ataque. Las dos foráneas de esta mañana se añadieron al lado minoritario. Ponerlas
-- compuestas ACERCA a la consistencia; dejarlas simples era lo inconsistente.
--
-- **Y el ataque no era teórico: lo ejecutó contra Neon, tres veces.**
--
--   · Una agencia inserta una tarifa SUYA colgada de la vigencia de otra  → OK, 1 fila
--   · Una agencia crea una vigencia SUYA colgada del paquete de otra      → OK, 1 fila
--   · Una agencia MUEVE una tarifa suya a la vigencia de otra con UPDATE  → OK, 1 fila
--
-- El `WITH CHECK` de RLS valida el `tenant_id` de la fila nueva; **nadie valida el del padre**,
-- porque la integridad referencial se evalúa por encima de las políticas. Y con cascada: la otra
-- agencia borra su vigencia y se lleva por delante una fila de dinero que nunca pudo ver.
--
-- Hoy no es alcanzable desde la API —no existe ninguna ruta de alta de vigencias ni tarifas—,
-- pero la alternativa era aplazarlo hasta que se escribiera esa ruta y confiar en acordarse.
-- Cuesta una migración. Se hace ahora.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Los únicos que la foránea compuesta necesita como destino
--
-- `paquetes` ya trae el suyo desde la migración del CRM, que lo creó por esta misma razón.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS "vigencias_id_tenant_id_key" ON "vigencias" ("id", "tenant_id");
CREATE UNIQUE INDEX IF NOT EXISTS "mayoristas_id_tenant_id_key" ON "mayoristas" ("id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 2. `vigencias` -> `paquetes`
-- -----------------------------------------------------------------------------
ALTER TABLE "vigencias" DROP CONSTRAINT IF EXISTS "vigencias_paquete_id_fkey";

ALTER TABLE "vigencias"
  ADD CONSTRAINT "vigencias_paquete_id_fkey"
  FOREIGN KEY ("paquete_id", "tenant_id") REFERENCES "paquetes" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 3. `tarifas` -> `vigencias`
-- -----------------------------------------------------------------------------
ALTER TABLE "tarifas" DROP CONSTRAINT IF EXISTS "tarifas_vigencia_id_fkey";

ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_vigencia_id_fkey"
  FOREIGN KEY ("vigencia_id", "tenant_id") REFERENCES "vigencias" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 4. `tarifas` -> `mayoristas`, y aquí hay una trampa que ya nos mordió
--
-- La foránea anterior era `ON DELETE SET NULL`. **Una foránea COMPUESTA con `SET NULL` pone a
-- NULL todas sus columnas, `tenant_id` incluido** — que es `NOT NULL`. PostgreSQL acepta el DDL
-- sin rechistar y revienta en tiempo de ejecución, el día que alguien borre un mayorista.
--
-- Se pasa a `RESTRICT`, que además es lo correcto para el negocio: `mayoristas` lleva
-- `eliminado_en` y se borra en blando. Un mayorista con tarifas vivas no debería desaparecer de
-- la base: se marca como eliminado y sus tarifas siguen diciendo a quién se le compró esa silla.
-- -----------------------------------------------------------------------------
ALTER TABLE "tarifas" DROP CONSTRAINT IF EXISTS "tarifas_mayorista_id_fkey";

ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_mayorista_id_fkey"
  FOREIGN KEY ("mayorista_id", "tenant_id") REFERENCES "mayoristas" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 5. Comprobación: que lo que se acaba de declarar sea lo que hay
--
-- Una migración que dice hacer algo y no lo hace es peor que no haberla escrito, porque deja la
-- afirmación en el repositorio. Esto falla el despliegue en vez de dejar un hallazgo para dentro
-- de seis meses.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  simples text;
BEGIN
  SELECT string_agg(c.conname, ', ')
    INTO simples
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE c.contype = 'f'
     AND t.relname IN ('vigencias', 'tarifas')
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(c.conkey) AS k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'tenant_id'
     );
  IF simples IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan foraneas sin tenant_id en el catalogo -> %', simples;
  END IF;
END;
$$;

-- El aislamiento no cambia, pero se reaplica: es idempotente y deja las tablas gobernadas por el
-- mecanismo y no por su historia.
SELECT aplicar_aislamiento_tenant('vigencias');
SELECT aplicar_aislamiento_tenant('tarifas');
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
