-- =============================================================================
-- T-241, ADR-0024 F2 (parte de `quoting`) — TRM y mayorista por línea congelados en la versión
--
-- ADR-0024 §2: la TRM es un dato DE LO OFRECIDO y vive en `versiones_cotizacion`, inmutable; y
-- cada línea congela su `mayoristaId`, para que el consumidor `booking.abrir_archivo` cree una
-- reserva por mayorista sin leer el catálogo (el mayorista de una tarifa puede cambiar después).
--
-- Qué hace, en orden:
--   1. Cinco columnas NULABLES en `versiones_cotizacion`: `trm_moneda_origen char(3)`,
--      `trm_moneda_destino char(3)`, `trm_valor numeric(18,6)`, `trm_fecha date` y `trm_fuente`
--      (el enum `fuente_trm` que creó F1, 20261117120000). Nulas = la versión está en la moneda
--      del tenant (hoy, todo el catálogo del piloto, en COP).
--   2. CHECK `versiones_cotizacion_trm_valida`: las cinco o ninguna, códigos ISO-4217 en
--      mayúsculas, `trm_valor > 0` y origen ≠ destino. Este último es el mínimo de coherencia: una
--      tasa de una moneda a sí misma no es una conversión.
--   3. La misma regla, corregida, para `travel_files` (`travel_files_trm_valida`). El CHECK de F1
--      (`travel_files_trm_completa`) tiene un hueco de lógica de tres valores: con
--      `trm_moneda_origen` NULL y las otras cuatro presentes, el segundo disyuntivo es NULL y un
--      CHECK que da NULL PASA. No se edita una migración aplicada: se añade el correcto al lado.
--      `travel_files` aún no tiene filas (nada la escribe hasta F2), así que VALIDATE no falla.
--   4. El disparador de ALTA (`versiones_cotizacion_validar_alta`) gana dos reglas que un CHECK
--      no puede expresar porque miran otra tabla o dentro del JSON:
--        a. Moneda destino de la TRM = moneda del tenant (`tenants.moneda_iso`). Cola de ADR-0024
--           (dueño `datos`): «la moneda en que se le habla al cliente» es la de la agencia.
--        b. `mayoristaId` de cada línea: si la clave está, es NULL o el uuid de un mayorista DE
--           ESTA agencia. `lineas` es JSON y no admite foránea; esto es la foránea compuesta con
--           el tenant que tendría si fuera columna. Sin ella, una versión podría congelar el id de
--           un mayorista de OTRA agencia, y el consumidor lo llevaría a `bookings`, donde la
--           foránea compuesta lo rechazaría en bucle hasta abandonar el evento. La búsqueda corre
--           con el rol de quien escribe (el disparador NO es SECURITY DEFINER), bajo su RLS.
--      Los dos son SOLO del alta: la versión es inmutable (`versiones_cotizacion_inmutables`
--      rechaza todo UPDATE sin listar columnas), así que las columnas nuevas quedan congeladas
--      igual que las demás y ese disparador no se toca.
--   5. RLS y privilegios reaplicados por el único mecanismo que los gobierna, y cinturón.
--
-- **Qué NO hace, a propósito.**
--   · No exige TRM cuando `moneda_iso` ≠ moneda del tenant ni la clave `mayoristaId` en las
--     líneas. La versión anterior de la API (en ejecución mientras corre esta migración) escribe
--     versiones sin ninguna de las dos: exigirlas rompería el alta hasta desplegar F2 («expandir y
--     luego contraer»). Si se quiere exigir, va en una migración posterior a F2.
--   · No fija `trm_moneda_origen = moneda_iso`. ADR-0024 §2 no lo dice y la combinación
--     «origen = moneda de las tarifas» depende de cómo F2 represente el equivalente; queda en la
--     cola (dueño `datos`) si el dominio lo confirma.
--   · No rellena versiones existentes: una versión es inmutable y no se reescribe la prueba.
--
-- **Dinero (R8).** Los importes siguen en `bigint` en la moneda de las tarifas; la tasa es
-- `numeric(18,6)`, decimal exacto, nunca `float`. **Fechas (R9).** `trm_fecha` es `date`: el día de
-- la tasa no depende del huso.
--
-- **Segura en caliente.** `ADD COLUMN` nulable sin DEFAULT es un cambio de catálogo: no reescribe
-- filas ni dispara disparadores de fila. CHECK `NOT VALID` (catálogo) y `VALIDATE` con SHARE UPDATE
-- EXCLUSIVE, que no bloquea lecturas ni escrituras; toda fila existente tiene las cinco a NULL, así
-- que no puede fallar. `CREATE OR REPLACE FUNCTION` del disparador: catálogo.
--
-- **REVERSIBLE** con una migración posterior (antes, F2 tiene que dejar de escribirlas):
--   ALTER TABLE "travel_files" DROP CONSTRAINT "travel_files_trm_valida";
--   ALTER TABLE "versiones_cotizacion" DROP CONSTRAINT "versiones_cotizacion_trm_valida",
--     DROP COLUMN "trm_moneda_origen", DROP COLUMN "trm_moneda_destino", DROP COLUMN "trm_valor",
--     DROP COLUMN "trm_fecha", DROP COLUMN "trm_fuente";
--   y el cuerpo anterior de versiones_cotizacion_validar_alta() (20261019200000 §4.1).
-- Se pierde la TRM de las versiones creadas después de esta migración; el `mayoristaId` de las
-- líneas puede quedarse (JSON, nadie lo exige).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las columnas
-- -----------------------------------------------------------------------------
ALTER TABLE "versiones_cotizacion"
  ADD COLUMN "trm_moneda_origen" CHAR(3),
  ADD COLUMN "trm_moneda_destino" CHAR(3),
  ADD COLUMN "trm_valor" DECIMAL(18,6),
  ADD COLUMN "trm_fecha" DATE,
  ADD COLUMN "trm_fuente" "fuente_trm";

COMMENT ON COLUMN "versiones_cotizacion"."trm_moneda_origen" IS
  'ADR-0024 §2 (exchangeRate): moneda de las tarifas. Las cinco trm_* o ninguna. Inmutable como el resto de la versión.';
COMMENT ON COLUMN "versiones_cotizacion"."trm_moneda_destino" IS
  'ADR-0024 §2: moneda en que se le habla al cliente; el disparador de alta exige la del tenant.';
COMMENT ON COLUMN "versiones_cotizacion"."trm_valor" IS
  'ADR-0024 §2: unidades de destino por 1 de origen. Decimal exacto, > 0. Referencial: la tasa que se paga se congela en cada abono (payments).';
COMMENT ON COLUMN "versiones_cotizacion"."trm_fecha" IS
  'ADR-0024 §2: día de la tasa (date, R9).';
COMMENT ON COLUMN "versiones_cotizacion"."trm_fuente" IS
  'ADR-0024 §2: OFICIAL (Superfinanciera) o AGENCIA (la propia de la agencia).';

-- -----------------------------------------------------------------------------
-- 2 y 3. Los CHECK, en dos pasos
--
-- Cada término del segundo disyuntivo es estrictamente booleano con NULL tratado: `IS NOT NULL`
-- explícito antes del `~` y del `>`, para que ningún nulo deje el CHECK en NULL (que pasaría).
-- -----------------------------------------------------------------------------
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_trm_valida" CHECK (
    ("trm_moneda_origen" IS NULL AND "trm_moneda_destino" IS NULL AND "trm_valor" IS NULL
      AND "trm_fecha" IS NULL AND "trm_fuente" IS NULL)
    OR ("trm_moneda_origen" IS NOT NULL AND "trm_moneda_destino" IS NOT NULL
      AND "trm_valor" IS NOT NULL AND "trm_fecha" IS NOT NULL AND "trm_fuente" IS NOT NULL
      AND "trm_moneda_origen" ~ '^[A-Z]{3}$' AND "trm_moneda_destino" ~ '^[A-Z]{3}$'
      AND "trm_moneda_origen" <> "trm_moneda_destino"
      AND "trm_valor" > 0)
  ) NOT VALID;

ALTER TABLE "travel_files"
  ADD CONSTRAINT "travel_files_trm_valida" CHECK (
    ("trm_moneda_origen" IS NULL AND "trm_moneda_destino" IS NULL AND "trm_valor" IS NULL
      AND "trm_fecha" IS NULL AND "trm_fuente" IS NULL)
    OR ("trm_moneda_origen" IS NOT NULL AND "trm_moneda_destino" IS NOT NULL
      AND "trm_valor" IS NOT NULL AND "trm_fecha" IS NOT NULL AND "trm_fuente" IS NOT NULL
      AND "trm_moneda_origen" ~ '^[A-Z]{3}$' AND "trm_moneda_destino" ~ '^[A-Z]{3}$'
      AND "trm_moneda_origen" <> "trm_moneda_destino"
      AND "trm_valor" > 0)
  ) NOT VALID;

ALTER TABLE "versiones_cotizacion" VALIDATE CONSTRAINT "versiones_cotizacion_trm_valida";
ALTER TABLE "travel_files" VALIDATE CONSTRAINT "travel_files_trm_valida";

-- -----------------------------------------------------------------------------
-- 4. El disparador de alta: lo de 20261019200000 §4.1, intacto, más la moneda destino y el
--    mayorista de cada línea
--
-- Sigue sin ser SECURITY DEFINER: corre con el rol de quien escribe (viajapro_app), bajo su RLS,
-- y `tenants` la lee porque ese rol la tiene declarada {SELECT}. Un disparador no necesita
-- EXECUTE para dispararse; el REVOKE a PUBLIC se reafirma y la matriz rol × función no cambia.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION versiones_cotizacion_validar_alta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  malas integer;
  suma  numeric;
  moneda_de_la_agencia text;
  mayoristas_ajenos integer;
BEGIN
  IF pg_catalog.jsonb_typeof(NEW.lineas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'version de cotizacion: lineas debe ser un arreglo JSON'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) FILTER (WHERE NOT COALESCE(
           pg_catalog.jsonb_typeof(e -> 'total') = 'object'
           AND (e -> 'total' ->> 'unidades') ~ '^-?[0-9]{1,18}$'
           AND (e -> 'total' ->> 'moneda') = NEW.moneda_iso, false)),
         sum(CASE WHEN (e -> 'total' ->> 'unidades') ~ '^-?[0-9]{1,18}$'
                  THEN (e -> 'total' ->> 'unidades')::numeric END)
    INTO malas, suma
    FROM pg_catalog.jsonb_array_elements(NEW.lineas) AS e;

  IF malas > 0 THEN
    RAISE EXCEPTION 'version de cotizacion: % linea(s) sin total entero en %', malas, NEW.moneda_iso
      USING ERRCODE = 'check_violation';
  END IF;
  IF suma IS DISTINCT FROM NEW.venta_unidades::numeric THEN
    RAISE EXCEPTION 'version de cotizacion: las lineas suman % y la venta dice %', suma, NEW.venta_unidades
      USING ERRCODE = 'check_violation';
  END IF;

  -- ADR-0024 §2: la TRM convierte A la moneda de la agencia. El CHECK ya garantiza que, si hay
  -- TRM, las cinco columnas están; aquí solo el destino contra `tenants`.
  IF NEW.trm_moneda_destino IS NOT NULL THEN
    SELECT t.moneda_iso INTO moneda_de_la_agencia
      FROM public.tenants t WHERE t.id = NEW.tenant_id;
    IF moneda_de_la_agencia IS DISTINCT FROM NEW.trm_moneda_destino THEN
      RAISE EXCEPTION 'version de cotizacion: la TRM convierte a % y la agencia trabaja en %',
          NEW.trm_moneda_destino, COALESCE(moneda_de_la_agencia, '(desconocida)')
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- ADR-0024 §2: el mayorista congelado por línea. La clave puede faltar (versión escrita por la
  -- API anterior a F2) o ser null (línea sin mayorista); si trae algo, es el uuid de un mayorista
  -- de ESTA agencia. El patrón va antes del cast, y en un CASE porque un AND no garantiza el
  -- orden de evaluación: un texto que no es uuid cuenta como ajeno, no revienta con 22P02.
  SELECT count(*)
    INTO mayoristas_ajenos
    FROM pg_catalog.jsonb_array_elements(NEW.lineas) AS e
   WHERE e ? 'mayoristaId'
     AND pg_catalog.jsonb_typeof(e -> 'mayoristaId') IS DISTINCT FROM 'null'
     AND NOT CASE
           WHEN pg_catalog.jsonb_typeof(e -> 'mayoristaId') = 'string'
                AND (e ->> 'mayoristaId') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
           THEN EXISTS (SELECT 1 FROM public.mayoristas m
                         WHERE m.id = (e ->> 'mayoristaId')::uuid
                           AND m.tenant_id = NEW.tenant_id)
           ELSE false
         END;

  IF mayoristas_ajenos > 0 THEN
    RAISE EXCEPTION 'version de cotizacion: % linea(s) con un mayoristaId que no es un mayorista de la agencia', mayoristas_ajenos
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION versiones_cotizacion_validar_alta() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 5. RLS y privilegios, por el único mecanismo que los gobierna; y el cinturón
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('versiones_cotizacion');
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

  -- Las cinco columnas, nulables y con su tipo.
  IF (SELECT count(*) FROM pg_attribute a
       WHERE a.attrelid = 'public.versiones_cotizacion'::regclass
         AND NOT a.attisdropped AND NOT a.attnotnull
         AND (a.attname, pg_catalog.format_type(a.atttypid, a.atttypmod)) IN (
               ('trm_moneda_origen', 'character(3)'),
               ('trm_moneda_destino', 'character(3)'),
               ('trm_valor', 'numeric(18,6)'),
               ('trm_fecha', 'date'),
               ('trm_fuente', 'fuente_trm'))) <> 5 THEN
    RAISE EXCEPTION 'versiones_cotizacion no tiene las cinco columnas trm_* nulables con su tipo.';
  END IF;

  -- Los dos CHECK, por nombre y VALIDADOS.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE contype = 'c' AND convalidated
                    AND conrelid = 'public.versiones_cotizacion'::regclass
                    AND conname = 'versiones_cotizacion_trm_valida')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint
                     WHERE contype = 'c' AND convalidated
                       AND conrelid = 'public.travel_files'::regclass
                       AND conname = 'travel_files_trm_valida') THEN
    RAISE EXCEPTION 'Falta (o no esta validado) un CHECK de TRM.';
  END IF;

  -- El disparador de alta sigue sin ser SECURITY DEFINER, con search_path vacío y sin EXECUTE
  -- para PUBLIC.
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'versiones_cotizacion_validar_alta'
                AND (p.prosecdef OR NOT (COALESCE(p.proconfig, '{}') && ARRAY['search_path=""', 'search_path='])
                     OR has_function_privilege('public', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'versiones_cotizacion_validar_alta es SECURITY DEFINER, no fija search_path vacío o la ejecuta PUBLIC.';
  END IF;

  -- Los tres disparadores de la versión siguen armados: las columnas nuevas no abren una puerta.
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
