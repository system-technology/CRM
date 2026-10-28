-- =============================================================================
-- T-082 — `seguimientos`: varios compromisos con fecha por oportunidad, y también sobre una
-- conversación
--
-- Sustituye al adaptador provisional de T-077, que guardaba UN seguimiento por oportunidad en las
-- columnas `oportunidades.proxima_tarea_*` y no podía colgar ninguno de una conversación. Esta
-- tabla es lo que el doble `seguimientos-en-memoria.ts` ya describía como comportamiento completo.
--
-- Qué hace, en orden:
--   1. Crea `seguimientos`, tabla por agencia (tenant_id NOT NULL).
--   2. Claves foráneas TODAS compuestas con el tenant: contacto, oportunidad (de TRES columnas:
--      la oportunidad es de esta agencia y de este mismo contacto, como en `cotizaciones`),
--      conversación, asesor y auditoría.
--   3. CHECK: exactamente uno de `oportunidad_id` / `conversacion_id`.
--   4. Índices de las rutas calientes, el tenant siempre primero; «pendientes del asesor» es
--      PARCIAL (`WHERE completado_en IS NULL`).
--   5. RLS y privilegios por el único mecanismo que los gobierna (`aplicar_aislamiento_tenant` +
--      `aplicar_privilegios_declarados`): ENABLE + FORCE + USING y WITH CHECK canónicos, y los
--      mismos GRANT que toda tabla de negocio (viajapro_app, viajapro_altas, viajapro_webhook;
--      nada para viajapro_identidad).
--   6. Copia los seguimientos que el adaptador provisional dejó en `proxima_tarea_*`, agencia por
--      agencia con su contexto, para que no desaparezcan de «pendientes del día» al cambiar de
--      adaptador. Las columnas viejas NO se tocan (las sigue leyendo el tablero).
--   7. Cinturón: la migración no termina si la tabla queda sin aislamiento o con una foránea sin
--      tenant.
--
-- **Segura en caliente.** Tabla nueva: nada de lo existente se reescribe ni se bloquea más allá
-- del instante de crear las foráneas (SHARE ROW EXCLUSIVE sobre los padres, sin recorrerlos: la
-- tabla hija está vacía). La copia del paso 6 lee `oportunidades` sin bloquearla.
--
-- **REVERSIBLE** con una migración posterior: `DROP TABLE "seguimientos"`. Lo que se pierde son
-- los seguimientos creados después de esta migración (varios por oportunidad, los de conversación
-- y los instantes de completado reales); los copiados en el paso 6 siguen en `proxima_tarea_*`.
-- =============================================================================

-- uuid v7 en SQL, solo para la copia del paso 6 (la aplicación los genera con Prisma).
-- OR REPLACE: otras migraciones crean la misma en `pg_temp`, y la aserción 23 las corre todas en
-- la misma sesión.
CREATE OR REPLACE FUNCTION pg_temp.uuid_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
              PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
              FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;

-- -----------------------------------------------------------------------------
-- 1. La tabla
--
-- `contacto_id` NOT NULL aunque se pueda derivar del destino: «pendientes del día» pinta el nombre
-- del contacto en cada fila, y derivarlo sería un join condicional a dos tablas en la consulta más
-- frecuente del inicio del asesor. Que coincida con el del destino lo garantiza, para la
-- oportunidad, la foránea de tres columnas; para la conversación, el adaptador (lo lee de la
-- conversación en la misma transacción). Ver la nota de cola en el paso 2.
--
-- `asesor_id` nulo: el caso de uso le pone el dueño del destino o quien lo crea, y una
-- automatización no tiene «quien lo crea».
-- -----------------------------------------------------------------------------
CREATE TABLE "seguimientos" (
    "id"              UUID           NOT NULL,
    "tenant_id"       UUID           NOT NULL,
    "descripcion"     VARCHAR(200)   NOT NULL,
    "vence_en"        TIMESTAMPTZ(3) NOT NULL,
    "completado_en"   TIMESTAMPTZ(3),
    "asesor_id"       UUID,
    "contacto_id"     UUID           NOT NULL,
    "oportunidad_id"  UUID,
    "conversacion_id" UUID,
    "creado_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"  TIMESTAMPTZ(3) NOT NULL,
    "creado_por"      UUID,
    "actualizado_por" UUID,

    CONSTRAINT "seguimientos_pkey" PRIMARY KEY ("id"),
    -- El contrato: «sobre una oportunidad o sobre una conversación (exactamente una de las dos)».
    -- Ninguna = un compromiso que no se puede abrir desde ningún sitio; las dos = dos verdades.
    CONSTRAINT "seguimientos_exactamente_un_destino"
      CHECK (num_nonnulls("oportunidad_id", "conversacion_id") = 1),
    CONSTRAINT "seguimientos_descripcion_no_vacia" CHECK (length(btrim("descripcion")) > 0)
);

-- Destino de cualquier foránea compuesta futura hacia un seguimiento (p. ej. recordatorios).
CREATE UNIQUE INDEX "seguimientos_id_tenant_id_key" ON "seguimientos" ("id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 2. Claves foráneas — TODAS compuestas con el tenant
--
-- RLS no interviene en la integridad referencial: con una clave simple, el seguimiento de una
-- agencia podría colgar de la oportunidad, la conversación o el asesor de otra.
--
-- CASCADE hacia contacto, oportunidad y conversación: un seguimiento no tiene sentido sin su
-- destino, y esas tres se borran en blando (el borrado físico solo llega con la purga de un tenant,
-- que así no aborta a mitad). RESTRICT hacia `usuarios`, como en el resto del esquema: no se puede
-- anular media clave compuesta, y los usuarios también se borran en blando.
--
-- Cola (no bloquea): la coherencia contacto ↔ conversación no la expresa una foránea, porque
-- exigiría un único (id, contacto_id, tenant_id) nuevo sobre `conversaciones`. Es coherencia de
-- dominio, no aislamiento: la compuesta de dos columnas ya impide la conversación de otra agencia.
-- -----------------------------------------------------------------------------
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- Tres columnas, sobre el único `oportunidades_id_contacto_id_tenant_id_key` que ya existe para
-- `cotizaciones`. MATCH SIMPLE: con `oportunidad_id` nulo no comprueba nada, que es lo que se
-- quiere para los seguimientos de conversación.
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_oportunidad_id_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("oportunidad_id", "contacto_id", "tenant_id")
  REFERENCES "oportunidades" ("id", "contacto_id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_conversacion_id_tenant_id_fkey"
  FOREIGN KEY ("conversacion_id", "tenant_id") REFERENCES "conversaciones" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_asesor_id_tenant_id_fkey"
  FOREIGN KEY ("asesor_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "seguimientos" ADD CONSTRAINT "seguimientos_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. Índices. El tenant va SIEMPRE primero.
-- -----------------------------------------------------------------------------

-- «Pendientes del día» de un asesor: lo vivo, por vencimiento. PARCIAL: lo completado es casi
-- toda la tabla con el tiempo y esta consulta no lo mira nunca. Prisma no modela el WHERE; lo
-- documenta `schema.prisma` con este mismo nombre.
CREATE INDEX "idx_seguimientos_pendientes_por_asesor"
  ON "seguimientos" ("tenant_id", "asesor_id", "vence_en")
  WHERE "completado_en" IS NULL;

-- Listado sin filtro de asesor (vista de supervisor), en cualquier estado, por vencimiento.
CREATE INDEX "seguimientos_tenant_id_vence_en_idx" ON "seguimientos" ("tenant_id", "vence_en");
-- Los de una oportunidad y los de una conversación (panel lateral); sostienen además las
-- cascadas de las foráneas.
CREATE INDEX "seguimientos_tenant_id_oportunidad_id_idx" ON "seguimientos" ("tenant_id", "oportunidad_id");
CREATE INDEX "seguimientos_tenant_id_conversacion_id_idx" ON "seguimientos" ("tenant_id", "conversacion_id");
CREATE INDEX "seguimientos_tenant_id_contacto_id_idx" ON "seguimientos" ("tenant_id", "contacto_id");

-- -----------------------------------------------------------------------------
-- 4. RLS y privilegios, por el único mecanismo que los gobierna
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('seguimientos');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5. Lo que el adaptador provisional dejó en `oportunidades.proxima_tarea_*`
--
-- Después de la RLS a propósito, y agencia por agencia con su contexto: las filas entran por el
-- WITH CHECK de su propia agencia, igual que desde la API, sin depender de que el rol de
-- migraciones tenga BYPASSRLS. El instante de completado no existía (era un booleano): se usa
-- `actualizado_en` de la oportunidad, que es la misma aproximación que servía el adaptador.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    INSERT INTO "seguimientos"
      ("id", "tenant_id", "descripcion", "vence_en", "completado_en", "asesor_id",
       "contacto_id", "oportunidad_id", "creado_en", "actualizado_en", "creado_por")
    SELECT pg_temp.uuid_v7(), o."tenant_id", o."proxima_tarea_descripcion",
           o."proxima_tarea_vence_en",
           CASE WHEN o."proxima_tarea_completada" THEN o."actualizado_en" END,
           o."asesor_id", o."contacto_id", o."id", o."actualizado_en", now(), o."actualizado_por"
      FROM "oportunidades" o
     WHERE o."tenant_id" = t.id
       AND o."eliminado_en" IS NULL
       AND o."proxima_tarea_descripcion" IS NOT NULL
       AND o."proxima_tarea_vence_en" IS NOT NULL
       AND length(btrim(o."proxima_tarea_descripcion")) > 0;
  END LOOP;

  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Cinturón: lo que esta migración dice haber hecho, comprobado
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

  -- Toda foránea de `seguimientos` lleva el tenant dentro, salvo la de `tenants` misma.
  SELECT string_agg(c.conname, ', ')
    INTO simples
    FROM pg_constraint c
   WHERE c.contype = 'f'
     AND c.conrelid = 'public.seguimientos'::regclass
     AND c.confrelid <> 'public.tenants'::regclass
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(c.conkey) AS k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'tenant_id'
     );
  IF simples IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan foraneas sin tenant_id en seguimientos -> %', simples;
  END IF;

  -- Las seis compuestas, por nombre: si faltara una, el barrido de arriba no lo vería.
  IF (SELECT count(*) FROM pg_constraint
       WHERE contype = 'f'
         AND conrelid = 'public.seguimientos'::regclass
         AND conname IN ('seguimientos_contacto_id_tenant_id_fkey',
                         'seguimientos_oportunidad_id_contacto_id_tenant_id_fkey',
                         'seguimientos_conversacion_id_tenant_id_fkey',
                         'seguimientos_asesor_id_tenant_id_fkey',
                         'seguimientos_creado_por_tenant_id_fkey',
                         'seguimientos_actualizado_por_tenant_id_fkey')) <> 6 THEN
    RAISE EXCEPTION 'Falta alguna de las foraneas compuestas de seguimientos.';
  END IF;
END;
$$;
