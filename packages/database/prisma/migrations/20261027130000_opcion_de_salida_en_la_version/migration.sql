-- =============================================================================
-- T-062 — la versión de cotización guarda la opción de salida con la que se cotizó
--
-- Desde M2 (`20261026120100`) un producto puede tener opciones de salida (turno, modalidad con su
-- punto de recogida) y una tarifa puede atarse a una. El cotizador ya la exige y la usa para
-- elegir tarifas, pero la versión guardada no la conservaba: al releer una cotización no se sabía
-- con qué opción se formó el total, y volver a cotizarla con la misma composición no era posible.
--
-- Qué hace, en orden:
--   1. `versiones_cotizacion.opcion_de_salida_id` UUID NULABLE. Nulo = el producto no tenía
--      opciones al cotizar, o la versión es anterior a esta migración (no se rellena: una versión
--      es inmutable y no se reescribe la prueba).
--   2. Índice `(tenant_id, opcion_de_salida_id)`: sostiene la foránea (el borrado de una opción
--      busca versiones que la usen) y el tenant va primero.
--   3. Foránea COMPUESTA `(opcion_de_salida_id, tenant_id)` → `opciones_de_salida (id, tenant_id)`.
--      La integridad referencial se evalúa por encima de RLS: con una simple, la versión de una
--      agencia podría citar la opción de otra.
--   4. RLS reaplicada por el único mecanismo que la gobierna (idempotente; la tabla no cambia de
--      política, solo se reconfirma) y el cinturón.
--
-- **La foránea va NOT VALID + VALIDATE.** `ADD CONSTRAINT … FOREIGN KEY` a secas toma SHARE ROW
-- EXCLUSIVE sobre la tabla hija mientras la recorre; `NOT VALID` lo reduce a un cambio de catálogo
-- y `VALIDATE` recorre con SHARE UPDATE EXCLUSIVE, que no bloquea lecturas ni escrituras. Toda
-- fila existente tiene la columna en NULL, así que la validación no puede fallar; se hace en la
-- misma migración para que la foránea quede `convalidated = true` (la prueba 72 lo exige).
--
-- **El disparador de inmutabilidad no estorba.** `ADD COLUMN` sin DEFAULT no reescribe filas ni
-- dispara nada; los disparadores de `versiones_cotizacion` son de fila (UPDATE/DELETE) y de
-- sentencia (TRUNCATE), no de DDL. La columna se escribe solo en el INSERT, como todo lo demás.
--
-- **ON DELETE NO ACTION**, como `tarifas.opcion_de_salida_id`: una opción citada por una versión
-- no se borra (se desactiva: `activa = false`), porque la versión es la prueba de lo que se
-- ofreció. NO ACTION y no RESTRICT: la purga de un tenant se lleva opciones y versiones en la
-- misma sentencia y no debe abortar a mitad. Tampoco SET NULL: en una compuesta pondría a NULL
-- también `tenant_id`, y además sería un UPDATE que el disparador de inmutabilidad rechaza.
--
-- **Segura en caliente.** Columna nulable sin DEFAULT (catálogo), índice sobre una columna toda
-- NULL (la tabla es de volumen bajo: una fila por versión guardada a mano), foránea en dos pasos.
-- Si la tabla creciera, el índice se construiría con CONCURRENTLY en una migración aparte; hoy
-- Prisma corre cada migración en una transacción y CONCURRENTLY no cabe en una.
--
-- **REVERSIBLE** con una migración posterior:
--   ALTER TABLE "versiones_cotizacion" DROP CONSTRAINT "versiones_cotizacion_opcion_de_salida_id_tenant_id_fkey";
--   DROP INDEX "versiones_cotizacion_tenant_id_opcion_de_salida_id_idx";
--   ALTER TABLE "versiones_cotizacion" DROP COLUMN "opcion_de_salida_id";
-- Lo que se pierde es la opción registrada en las versiones creadas después de esta migración; el
-- total de esas versiones sigue en sus líneas y en `venta_unidades`, que no dependen de ella.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La columna
-- -----------------------------------------------------------------------------
ALTER TABLE "versiones_cotizacion" ADD COLUMN "opcion_de_salida_id" UUID;

COMMENT ON COLUMN "versiones_cotizacion"."opcion_de_salida_id" IS
  'Opción de salida con la que se cotizó (ADR-0017 §3.1). NULL = el producto no tenía opciones, o la versión es anterior a T-062. Inmutable como el resto de la versión.';

-- -----------------------------------------------------------------------------
-- 2. Índice. El tenant va primero.
-- -----------------------------------------------------------------------------
CREATE INDEX "versiones_cotizacion_tenant_id_opcion_de_salida_id_idx"
  ON "versiones_cotizacion" ("tenant_id", "opcion_de_salida_id");

-- -----------------------------------------------------------------------------
-- 3. Foránea COMPUESTA con el tenant, en dos pasos
-- -----------------------------------------------------------------------------
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_opcion_de_salida_id_tenant_id_fkey"
  FOREIGN KEY ("opcion_de_salida_id", "tenant_id") REFERENCES "opciones_de_salida" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "versiones_cotizacion"
  VALIDATE CONSTRAINT "versiones_cotizacion_opcion_de_salida_id_tenant_id_fkey";

-- -----------------------------------------------------------------------------
-- 4. RLS y privilegios, por el único mecanismo que los gobierna
--
-- La tabla ya estaba aislada; reaplicar es idempotente y deja constancia de que la política no
-- cambia con la columna nueva. Privilegios: una columna nueva hereda los GRANT de tabla.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('versiones_cotizacion');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  simples text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- Toda foránea de `versiones_cotizacion` lleva el tenant dentro, salvo la de `tenants` misma.
  SELECT string_agg(c.conname, ', ')
    INTO simples
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.conrelid = 'public.versiones_cotizacion'::regclass
     AND c.confrelid <> 'public.tenants'::regclass
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(c.conkey) AS k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'tenant_id'
     );
  IF simples IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan foraneas sin tenant_id en versiones_cotizacion -> %', simples;
  END IF;

  -- La nueva, por nombre, VALIDADA y hacia la tabla correcta: si faltara, el barrido de arriba
  -- no lo vería (no hay foránea que juzgar).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid = 'public.versiones_cotizacion'::regclass
       AND confrelid = 'public.opciones_de_salida'::regclass
       AND conname = 'versiones_cotizacion_opcion_de_salida_id_tenant_id_fkey'
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'Falta (o no esta validada) la foranea compuesta versiones_cotizacion -> opciones_de_salida.';
  END IF;

  -- Los tres disparadores de la versión siguen armados: la columna nueva no abre una puerta.
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.versiones_cotizacion'::regclass
         AND NOT tgisinternal
         AND tgenabled = 'O'
         AND tgname IN ('versiones_cotizacion_inmutables',
                        'versiones_cotizacion_sin_truncate',
                        'versiones_cotizacion_validar_alta')) <> 3 THEN
    RAISE EXCEPTION 'Algun disparador de versiones_cotizacion no esta habilitado.';
  END IF;
END;
$$;
