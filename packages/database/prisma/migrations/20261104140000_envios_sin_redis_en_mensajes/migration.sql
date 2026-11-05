-- =============================================================================
-- ADR-0019 paso 3 — el estado del envío saliente vive en `mensajes`, no en Redis
--
-- En modo `unico` (ADR-0019 §1.2) no hay Redis: la cola de envíos (`ColaDeEnviosPostgres`) y la
-- reserva anti-duplicado (`ReservaDeEnvioPostgres`, que sustituye al `SET NX` de ADR-0018 §3.2)
-- guardan su estado en la propia fila del mensaje, que ya tiene `tenant_id` y RLS forzada. Sin
-- tabla nueva: una tabla de trabajos genérica duplicaría ese estado y, para el correo previo a la
-- agencia, pediría `tenant_id` nulo y una entrada en `excepciones_rls` (R1).
--
-- Qué hace, en orden:
--   1. `mensajes.envio_reservado_en` TIMESTAMPTZ(3) NULABLE. La reserva DURABLE: se pone con
--      `UPDATE ... SET envio_reservado_en = now() WHERE tenant_id = $1 AND id = $2
--       AND envio_reservado_en IS NULL AND wamid IS NULL RETURNING id` justo antes de llamar a
--      Meta. Una fila reservada **nunca** se reenvía: si el proceso muere entre la reserva y la
--      respuesta, el barrido la marca FALLIDO «sin confirmar» (ADR-0019 §3.2). NULL = nunca se
--      intentó, que es lo que son todas las filas existentes.
--   2. `mensajes.envio_intentos` INTEGER NOT NULL DEFAULT 0. Cuántas veces se reclamó el envío.
--   3. `mensajes.envio_siguiente_en` TIMESTAMPTZ(3) NULABLE. El arrendamiento y la espera del
--      reintento a la vez: el reclamo lo pone a `now() + 2 min` y lo confirma ANTES de llamar a
--      Meta; mientras esté en el futuro nadie más lo reclama. NULL = listo ya.
--   4. Dos CHECK: los intentos no son negativos, y un ENTRANTE no tiene estado de envío (un
--      entrante «reservado» sería un mensaje del viajero que alguien intentó mandar a Meta).
--   5. Índice parcial `idx_mensajes_envios_pendientes` para reclamar con FOR UPDATE SKIP LOCKED
--      por agencia, y para que el barrido encuentre arrendamientos vencidos y reservas sin wamid.
--   6. RLS y privilegios reaplicados por el mecanismo que los gobierna, y el cinturón.
--
-- **Sin datos personales.** Dos instantes y un contador; ninguno es PII.
--
-- **Privilegios.** Ninguno nuevo. Los tres roles de login de negocio (`viajapro_app`,
-- `viajapro_altas`, `viajapro_webhook`) tienen UPDATE de TABLA sobre `mensajes`
-- (`aplicar_privilegios_declarados`, 5.1), y el privilegio de tabla cubre toda columna, también
-- las que se añaden después: el repositorio no usa GRANT por columna. El adaptador de envíos corre
-- en el contexto del trabajador con `viajapro_webhook`; `viajapro_app` también puede, por si el
-- despacho se hace desde la API. `viajapro_identidad` sigue sin nada sobre `mensajes`. El cinturón
-- lo comprueba columna por columna.
--
-- **Segura en caliente** (Postgres 16):
--   - Las dos columnas nulables sin DEFAULT son cambio de catálogo.
--   - `envio_intentos NOT NULL DEFAULT 0`: con un DEFAULT constante, Postgres ≥ 11 guarda el valor
--     como «missing value» en el catálogo (`atthasmissing`): ni reescribe la tabla ni la recorre
--     para comprobar el NOT NULL. Es tan barato como las otras dos, y evita un contador nulo.
--   - Los CHECK entran NOT VALID (instante de catálogo) y se validan aparte con SHARE UPDATE
--     EXCLUSIVE, que no bloquea lecturas ni escrituras. Toda fila existente tiene las tres
--     columnas en su valor inicial, así que la validación no puede fallar.
--   - El índice se crea SIN CONCURRENTLY: Prisma corre cada migración en una transacción y
--     CONCURRENTLY no cabe en una (mismo criterio que 20261019210000 y 20261027130000). Bloquea
--     escrituras en `mensajes` mientras se construye, y no lecturas. Es seguro HOY: no hay ninguna
--     agencia real (los mensajes son los de las pruebas con el número de Meta), y el índice es
--     PARCIAL sobre los salientes pendientes sin wamid, que en régimen normal son casi ninguno, así
--     que la construcción recorre la tabla una vez pero escribe un índice diminuto. Si `mensajes`
--     ya tuviera volumen, el índice iría con CONCURRENTLY en una migración que no contuviera nada
--     más.
--
-- **REVERSIBLE** con una migración posterior:
--   DROP INDEX "idx_mensajes_envios_pendientes";
--   ALTER TABLE "mensajes" DROP CONSTRAINT "mensajes_envio_solo_saliente",
--                          DROP CONSTRAINT "mensajes_envio_intentos_no_negativo";
--   ALTER TABLE "mensajes" DROP COLUMN "envio_siguiente_en", DROP COLUMN "envio_intentos",
--                          DROP COLUMN "envio_reservado_en";
-- ANTES hay que volver al modo `escalado` (reserva en Redis): sin la columna, la reserva durable
-- desaparece y un mensaje reservado sin wamid podría reenviarse. Lo que se pierde es cuándo se
-- reservó y cuántas veces se intentó cada envío; estado, wamid y motivo de fallo no se tocan.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1–3. Las columnas
-- -----------------------------------------------------------------------------
ALTER TABLE "mensajes"
  ADD COLUMN "envio_reservado_en" TIMESTAMPTZ(3),
  ADD COLUMN "envio_intentos"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "envio_siguiente_en" TIMESTAMPTZ(3);

COMMENT ON COLUMN "mensajes"."envio_reservado_en" IS
  'Reserva durable del envío a Meta (ADR-0019 §1.2, sustituye al SET NX de ADR-0018 §3.2). Se pone una sola vez, con WHERE envio_reservado_en IS NULL AND wamid IS NULL, justo antes de llamar a Meta. Reservado y sin wamid = nunca se reenvía: el barrido lo marca FALLIDO sin confirmar. NULL = nunca se intentó.';
COMMENT ON COLUMN "mensajes"."envio_intentos" IS
  'Cuántas veces se reclamó el envío (ColaDeEnviosPostgres). Solo salientes; 0 en los entrantes y en lo anterior a ADR-0019.';
COMMENT ON COLUMN "mensajes"."envio_siguiente_en" IS
  'Arrendamiento y espera del reintento: no se reclama antes de este instante (UTC). El reclamo lo pone a now() + 2 min y lo confirma antes de llamar a Meta. NULL = listo ya.';

-- -----------------------------------------------------------------------------
-- 4. Coherencia, en dos pasos
-- -----------------------------------------------------------------------------
ALTER TABLE "mensajes"
  ADD CONSTRAINT "mensajes_envio_intentos_no_negativo"
  CHECK ("envio_intentos" >= 0)
  NOT VALID;

ALTER TABLE "mensajes"
  ADD CONSTRAINT "mensajes_envio_solo_saliente"
  CHECK (
    "direccion" = 'SALIENTE'
    OR ("envio_reservado_en" IS NULL AND "envio_siguiente_en" IS NULL AND "envio_intentos" = 0)
  )
  NOT VALID;

ALTER TABLE "mensajes" VALIDATE CONSTRAINT "mensajes_envio_intentos_no_negativo";
ALTER TABLE "mensajes" VALIDATE CONSTRAINT "mensajes_envio_solo_saliente";

-- -----------------------------------------------------------------------------
-- 5. Los envíos pendientes, PARCIAL
--
-- El predicado es `estado = 'PENDIENTE' AND wamid IS NULL`, sin `direccion`: un ENTRANTE siempre
-- trae wamid (`mensajes_entrante_exige_wamid`), así que el conjunto es exactamente el de los
-- salientes pendientes. Una consulta que quiera usar el índice tiene que llevar ESAS dos
-- condiciones literalmente (el planificador solo usa un índice parcial si su predicado se deduce
-- del WHERE). No lleva `envio_reservado_en IS NULL` a propósito: el mismo índice sirve al reclamo
-- (reservado IS NULL como filtro residual) y al barrido de reservas sin wamid.
--
-- Columnas: el tenant primero (el reclamo es por agencia y bajo RLS), luego el instante del
-- arrendamiento con los NULL («listo ya») delante, y `id` (UUID v7) como desempate estable:
--   SELECT id FROM mensajes
--    WHERE tenant_id = $1 AND estado = 'PENDIENTE' AND wamid IS NULL
--      AND envio_reservado_en IS NULL
--      AND (envio_siguiente_en IS NULL OR envio_siguiente_en <= now())
--    ORDER BY envio_siguiente_en NULLS FIRST, id
--    LIMIT $2
--    FOR UPDATE SKIP LOCKED;
-- -----------------------------------------------------------------------------
CREATE INDEX "idx_mensajes_envios_pendientes"
  ON "mensajes" ("tenant_id", "envio_siguiente_en" ASC NULLS FIRST, "id")
  WHERE "estado" = 'PENDIENTE' AND "wamid" IS NULL;

-- -----------------------------------------------------------------------------
-- 6. RLS y privilegios, por el único mecanismo que los gobierna
--
-- La tabla ya estaba aislada; reaplicar es idempotente. Las columnas nuevas heredan los GRANT de
-- tabla.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('mensajes');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 7. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  columna text;
  rol text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- `tenant_id` sigue NOT NULL y la tabla sigue con RLS habilitada Y forzada.
  IF NOT (SELECT attnotnull FROM pg_attribute
           WHERE attrelid = 'public.mensajes'::regclass AND attname = 'tenant_id') THEN
    RAISE EXCEPTION 'mensajes.tenant_id dejo de ser NOT NULL.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.mensajes'::regclass) THEN
    RAISE EXCEPTION 'mensajes no tiene RLS habilitada y forzada.';
  END IF;

  -- Las tres columnas, con su tipo y su nulabilidad.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'mensajes'
         AND ((column_name = 'envio_reservado_en' AND data_type = 'timestamp with time zone'
               AND datetime_precision = 3 AND is_nullable = 'YES' AND column_default IS NULL)
           OR (column_name = 'envio_siguiente_en' AND data_type = 'timestamp with time zone'
               AND datetime_precision = 3 AND is_nullable = 'YES' AND column_default IS NULL)
           OR (column_name = 'envio_intentos' AND data_type = 'integer'
               AND is_nullable = 'NO' AND column_default = '0'))) <> 3 THEN
    RAISE EXCEPTION 'Las columnas de envio de mensajes no tienen el tipo, la nulabilidad o el DEFAULT esperados.';
  END IF;

  -- Los dos CHECK existen y están validados.
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.mensajes'::regclass
         AND conname IN ('mensajes_envio_intentos_no_negativo', 'mensajes_envio_solo_saliente')
         AND contype = 'c'
         AND convalidated) <> 2 THEN
    RAISE EXCEPTION 'Falta (o no esta validado) algun CHECK de envio en mensajes.';
  END IF;

  -- El índice existe, es válido y es parcial.
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = 'public.idx_mensajes_envios_pendientes'::regclass
       AND i.indrelid = 'public.mensajes'::regclass
       AND i.indisvalid
       AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'idx_mensajes_envios_pendientes no existe, no es valido o no es parcial.';
  END IF;

  -- Los roles de negocio pueden leer y escribir las columnas nuevas (el adaptador reserva y
  -- registra intentos); el de identidad no toca `mensajes`. Un rol que aún no existe se omite,
  -- igual que en `aplicar_privilegios_declarados`.
  FOREACH rol IN ARRAY ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_webhook'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    FOREACH columna IN ARRAY ARRAY['envio_reservado_en', 'envio_intentos', 'envio_siguiente_en'] LOOP
      IF NOT (has_column_privilege(rol, 'public.mensajes', columna, 'SELECT')
              AND has_column_privilege(rol, 'public.mensajes', columna, 'UPDATE')) THEN
        RAISE EXCEPTION 'El rol % no puede leer o actualizar mensajes.%.', rol, columna;
      END IF;
    END LOOP;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_identidad')
     AND has_table_privilege('viajapro_identidad', 'public.mensajes', 'SELECT, UPDATE') THEN
    RAISE EXCEPTION 'viajapro_identidad tiene privilegios sobre mensajes.';
  END IF;
END;
$$;
