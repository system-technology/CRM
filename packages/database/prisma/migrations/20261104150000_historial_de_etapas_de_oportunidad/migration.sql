-- =============================================================================
-- T-131 — `oportunidad_cambios_etapa`: el historial de cambios de etapa de la oportunidad
--
-- Hoy `moverOportunidad` hace un UPDATE de `etapa_id` y no deja rastro: se pierde el «cuándo», el
-- «desde dónde» y quién llevaba la oportunidad en ese momento (roadmap de reportes, D1 y D8). Sin
-- eso no hay embudo temporal, ni tiempo en etapa, ni mes de venta o de pérdida. Un reporte se
-- construye en una semana; los meses de historial que no se guardaron no se recuperan nunca.
--
-- Qué hace, en orden:
--   1. Enum `origen_cambio_etapa` (ALTA, CAMBIO, MIGRACION) y la tabla, por agencia
--      (tenant_id NOT NULL). Una fila por alta y por movimiento, con la etapa de origen (nula en
--      el alta), la de destino, las banderas `es_ganada`/`es_perdida` COPIADAS de la etapa en ese
--      momento (la etapa viva se podrá renombrar o reconfigurar, T-120), el motivo de pérdida, el
--      asesor que llevaba la oportunidad en ese instante, quién la movió y cuándo (UTC).
--   2. Foráneas TODAS compuestas con el tenant: oportunidad, etapa de origen, etapa de destino,
--      asesor y usuario. Entran NOT VALID y se validan aparte.
--   3. CHECK de coherencia: una etapa no es ganada y perdida a la vez; el motivo solo existe en
--      una etapa de pérdida, y un CAMBIO a pérdida lo lleva siempre; solo un CAMBIO tiene etapa
--      de origen.
--   4. Índices (tenant_id, oportunidad_id, ocurrido_en) para la línea de vida de una oportunidad y
--      (tenant_id, ocurrido_en) para los reportes por periodo. El tenant, siempre primero.
--   5. SOLO AÑADIR: un disparador rechaza UPDATE, DELETE y TRUNCATE (ver §5).
--   6. RLS y privilegios por el único mecanismo que los gobierna.
--   7. Relleno: una fila `MIGRACION` por oportunidad existente con su etapa actual, agencia por
--      agencia con su contexto.
--   8. Cinturón: lo que esta migración dice haber hecho, comprobado.
--
-- **Sin datos personales (R10).** Solo identificadores, dos banderas, un enum y un instante. NO se
-- copia `nota_perdida`: es texto libre que puede contener cualquier cosa del viajero. El historial
-- guarda el motivo (enum) y la nota sigue donde estaba, en la oportunidad.
--
-- **Auditoría.** Es una tabla de hechos de solo añadir, como `registros_auditoria`: no tiene
-- `actualizado_en` ni `actualizado_por` porque una fila no se actualiza nunca. `ocurrido_en` es
-- el `creado_en` y `usuario_id` el `creado_por`.
--
-- **Lo que NO es el relleno del paso 7.** Una fila `MIGRACION` es una FOTO: «a la hora de esta
-- migración, la oportunidad estaba en esta etapa». No es un cambio, no tiene etapa de origen y su
-- `ocurrido_en` es el instante de la migración, no el del último movimiento (que no se sabe: solo
-- existe `actualizado_en`, que se mueve con cualquier edición). Los reportes de transiciones
-- filtran `origen <> 'MIGRACION'`; los de «en qué etapa estaba el día X» pueden usarla como punto
-- de partida. `cerrada_en` NO se rellena para las oportunidades que ya estaban cerradas: inventar
-- la fecha sería peor que no tenerla (el reporte las declara «sin fecha de cierre»).
--
-- **Segura en caliente.** Tabla nueva. Las foráneas se crean NOT VALID (instante de catálogo) y se
-- validan con SHARE UPDATE EXCLUSIVE sobre la hija, que solo contiene el relleno. Los padres
-- (`oportunidades`, `etapas_pipeline`, `usuarios`) reciben un SHARE ROW EXCLUSIVE breve al crear
-- la foránea: bloquea escrituras en ellos durante la transacción de la migración, y no lecturas.
-- Prisma corre el archivo en UNA transacción, así que la división no acorta la ventana; hoy no
-- importa (no hay agencia real y `oportunidades` tiene decenas de filas). El relleno lee
-- `oportunidades` sin bloquearla. Índices sin CONCURRENTLY por la misma transacción, sobre una
-- tabla recién creada.
--
-- **REVERSIBLE** con una migración posterior:
--   DROP TABLE "oportunidad_cambios_etapa";
--   DROP TYPE "origen_cambio_etapa";
-- (`historial_solo_anadir()` se queda si otra tabla la usa; si no, DROP FUNCTION.) El DROP TABLE
-- no lo para el disparador (no es DELETE ni TRUNCATE). ANTES hay que desplegar una API que no
-- escriba en la tabla: la actual falla al crear o mover una oportunidad sin ella. Lo que se pierde
-- es el historial capturado desde esta migración, que no se puede reconstruir. `cerrada_en` en
-- `oportunidades` no se toca y conserva lo que se haya escrito.
-- =============================================================================

-- uuid v7 en SQL, solo para el relleno del paso 7 (la aplicación los genera con Prisma).
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
-- 1. El enum y la tabla
--
-- Enum del motor y no tabla por agencia (R12): «de dónde salió esta fila» es un invariante del
-- sistema, no una política que cada agencia defina.
-- -----------------------------------------------------------------------------
CREATE TYPE "origen_cambio_etapa" AS ENUM ('ALTA', 'CAMBIO', 'MIGRACION');

CREATE TABLE "oportunidad_cambios_etapa" (
    "id"             UUID                  NOT NULL,
    "tenant_id"      UUID                  NOT NULL,
    "oportunidad_id" UUID                  NOT NULL,
    "origen"         "origen_cambio_etapa" NOT NULL,
    "etapa_desde_id" UUID,
    "etapa_hasta_id" UUID                  NOT NULL,
    "es_ganada"      BOOLEAN               NOT NULL,
    "es_perdida"     BOOLEAN               NOT NULL,
    "motivo_perdida" "motivo_perdida",
    "asesor_id"      UUID,
    "usuario_id"     UUID,
    "ocurrido_en"    TIMESTAMPTZ(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oportunidad_cambios_etapa_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "oportunidad_cambios_etapa" IS
  'Historial de etapas de la oportunidad (T-131). Solo añadir: una fila por alta (ALTA), por movimiento (CAMBIO) y la foto inicial de la migración (MIGRACION, no es un cambio). Banderas y asesor copiados del momento. Sin PII.';
COMMENT ON COLUMN "oportunidad_cambios_etapa"."es_ganada" IS
  'Copia de etapas_pipeline.es_ganada en el instante del cambio: no depende de cómo esté configurada la etapa hoy.';
COMMENT ON COLUMN "oportunidad_cambios_etapa"."asesor_id" IS
  'El asesor asignado a la oportunidad en ese instante (oportunidades.asesor_id se sobrescribe al reasignar). Atribución de ventas y pérdidas.';
COMMENT ON COLUMN "oportunidad_cambios_etapa"."usuario_id" IS
  'Quién hizo el cambio. Nulo en la foto de MIGRACION y cuando no hay usuario (automatización, atajo de desarrollo).';
COMMENT ON COLUMN "oportunidad_cambios_etapa"."ocurrido_en" IS
  'Instante del cambio, UTC, puesto por la base en la misma transacción que el cambio. En MIGRACION, el de la migración.';

-- -----------------------------------------------------------------------------
-- 2. Claves foráneas — TODAS compuestas con el tenant, NOT VALID y luego VALIDATE
--
-- RLS no interviene en la integridad referencial: con una clave simple, el historial de una
-- agencia podría colgar de la oportunidad, la etapa o el usuario de otra.
--
-- RESTRICT hacia todos los padres, y NO CASCADE, por la misma razón que `versiones_cotizacion`
-- (20261019200000): una acción referencial corre con el rol PROPIETARIO de la tabla que la sufre,
-- que es la mitad de la salida de purga del disparador de §5. Con RESTRICT ninguna acción hereda
-- ese rol. No estorba: oportunidades y usuarios se borran en blando, y la purga de una agencia
-- borra primero el historial (`borrar-tenants.mjs` descubre el orden).
--
-- Consecuencia que hay que saber (cola, T-120): una etapa que alguna vez se usó no se puede
-- borrar FÍSICAMENTE. Ya pasaba con una etapa que tuviera oportunidades; ahora vale para siempre.
-- Cuando la API de etapas permita quitarlas, será un borrado lógico.
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_oportunidad_id_tenant_id_fkey"
  FOREIGN KEY ("oportunidad_id", "tenant_id") REFERENCES "oportunidades" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_etapa_desde_id_tenant_id_fkey"
  FOREIGN KEY ("etapa_desde_id", "tenant_id") REFERENCES "etapas_pipeline" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_etapa_hasta_id_tenant_id_fkey"
  FOREIGN KEY ("etapa_hasta_id", "tenant_id") REFERENCES "etapas_pipeline" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_asesor_id_tenant_id_fkey"
  FOREIGN KEY ("asesor_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_usuario_id_tenant_id_fkey"
  FOREIGN KEY ("usuario_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 3. Coherencia
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_no_ganada_y_perdida"
  CHECK (NOT ("es_ganada" AND "es_perdida"))
  NOT VALID;

-- El motivo es de las pérdidas. Y un CAMBIO a una etapa de pérdida lo lleva siempre: es la regla
-- de `regla-de-perdida.ts`, que aquí queda también en la base. La foto de MIGRACION se exime
-- porque copia lo que haya, y hay oportunidades viejas (fixtures, semillas) perdidas sin motivo.
ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_motivo_de_perdida"
  CHECK (
    ("motivo_perdida" IS NULL OR "es_perdida")
    AND ("origen" <> 'CAMBIO' OR NOT "es_perdida" OR "motivo_perdida" IS NOT NULL)
  )
  NOT VALID;

-- Solo un CAMBIO viene de algún sitio. El alta y la foto no tienen etapa anterior.
ALTER TABLE "oportunidad_cambios_etapa"
  ADD CONSTRAINT "oportunidad_cambios_etapa_desde_solo_en_cambio"
  CHECK (("origen" = 'CAMBIO') = ("etapa_desde_id" IS NOT NULL))
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 4. Índices. El tenant va SIEMPRE primero.
-- -----------------------------------------------------------------------------

-- La línea de vida de una oportunidad, en orden; y la búsqueda de «la última fila» de cada una.
-- `id` (UUID v7) desempata dos filas del mismo milisegundo.
CREATE INDEX "idx_oportunidad_cambios_etapa_por_oportunidad"
  ON "oportunidad_cambios_etapa" ("tenant_id", "oportunidad_id", "ocurrido_en", "id");

-- Reportes por periodo: ganadas y perdidas del mes, transiciones de la semana.
CREATE INDEX "idx_oportunidad_cambios_etapa_por_instante"
  ON "oportunidad_cambios_etapa" ("tenant_id", "ocurrido_en");

-- Destino de cualquier foránea compuesta futura hacia una fila del historial.
CREATE UNIQUE INDEX "oportunidad_cambios_etapa_id_tenant_id_key"
  ON "oportunidad_cambios_etapa" ("id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 5. Solo añadir
--
-- **Por qué un disparador y no un REVOKE.** `aplicar_privilegios_declarados()` concede SELECT,
-- INSERT, UPDATE y DELETE sobre TODAS las tablas a los tres roles de login en cada migración que
-- la llama, y solo revoca lo que declara `excepciones_rls`, que es para tablas FUERA de RLS: esta
-- no puede estar ahí (la sacaría de `tablas_sin_aislamiento`). Un REVOKE escrito aquí duraría
-- hasta la siguiente migración y no avisaría al caducar. El disparador, en cambio, vale contra
-- cualquier rol y sobrevive a cualquier GRANT: es la declaración que se cumple.
--
-- Una sola salida, la misma que `versiones_cotizacion`: la purga de la agencia entera (Ley 1581,
-- supresión), que exige a la vez (a) ser el PROPIETARIO de la tabla —ningún rol de aplicación lo
-- es— y (b) haber declarado en ESTA transacción los tenants que se purgan con
-- `set_config('viajapro.purga_de_tenants', '<uuid>,…', true)`, que es lo que hace
-- `scripts/borrar-tenants.mjs`. El UPDATE no tiene salida para nadie: corregir es añadir.
--
-- Genérica a propósito (OR REPLACE): T-132 la usa para `cotizacion_cambios_estado` con el mismo
-- cuerpo, y cualquiera de las dos migraciones puede llegar primero.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION historial_solo_anadir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_LEVEL = 'ROW'
     AND current_user = (SELECT pg_catalog.pg_get_userbyid(c.relowner)
                           FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)
     AND OLD.tenant_id::text = ANY (pg_catalog.string_to_array(
           pg_catalog.current_setting('viajapro.purga_de_tenants', true), ','))
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'historial de solo añadir: % rechazado en %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation',
          HINT = 'El historial no se corrige ni se borra: se añade una fila nueva.';
END;
$$;

COMMENT ON FUNCTION historial_solo_anadir() IS
  'Disparador de las tablas de historial (T-131, T-132): rechaza UPDATE, DELETE y TRUNCATE salvo el DELETE de la purga de tenants declarada por el propietario.';

REVOKE ALL ON FUNCTION historial_solo_anadir() FROM PUBLIC;

CREATE TRIGGER "oportunidad_cambios_etapa_solo_anadir"
  BEFORE UPDATE OR DELETE ON "oportunidad_cambios_etapa"
  FOR EACH ROW EXECUTE FUNCTION historial_solo_anadir();

CREATE TRIGGER "oportunidad_cambios_etapa_sin_truncate"
  BEFORE TRUNCATE ON "oportunidad_cambios_etapa"
  FOR EACH STATEMENT EXECUTE FUNCTION historial_solo_anadir();

-- -----------------------------------------------------------------------------
-- 6. RLS y privilegios, por el único mecanismo que los gobierna
--
-- ENABLE + FORCE + política canónica con USING y WITH CHECK. Los tres roles de login de negocio
-- reciben los mismos privilegios de fila que en cualquier tabla de negocio (el UPDATE y el DELETE
-- los para el disparador de §5); `viajapro_identidad`, ninguno.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('oportunidad_cambios_etapa');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 7. Relleno: la foto de MIGRACION
--
-- Agencia por agencia con `app.current_tenant`: `oportunidades` y esta tabla tienen RLS FORZADA,
-- y con un rol de migraciones sin BYPASSRLS un INSERT … SELECT sin contexto vería cero filas y
-- terminaría en verde sin rellenar nada (mismo motivo que 20261026120000 y 20261104130000). La
-- comprobación de cada vuelta falla el despliegue si quedó alguna sin foto.
--
-- Todas las oportunidades, también las borradas en blando: son de la agencia y los reportes las
-- excluyen por `oportunidades.eliminado_en`. El motivo solo se copia si la etapa es de pérdida
-- (CHECK del paso 3); `asesor_id` es el actual, que es lo único que se sabe.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  sin_foto integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    INSERT INTO "oportunidad_cambios_etapa"
      ("id", "tenant_id", "oportunidad_id", "origen", "etapa_desde_id", "etapa_hasta_id",
       "es_ganada", "es_perdida", "motivo_perdida", "asesor_id", "usuario_id", "ocurrido_en")
    SELECT pg_temp.uuid_v7(), o."tenant_id", o."id", 'MIGRACION', NULL, o."etapa_id",
           e."es_ganada", e."es_perdida",
           CASE WHEN e."es_perdida" THEN o."motivo_perdida" END,
           o."asesor_id", NULL, now()
      FROM "oportunidades" o
      JOIN "etapas_pipeline" e ON e."id" = o."etapa_id" AND e."tenant_id" = o."tenant_id"
     WHERE o."tenant_id" = t.id
       AND NOT EXISTS (
         SELECT 1 FROM "oportunidad_cambios_etapa" h
          WHERE h."tenant_id" = o."tenant_id" AND h."oportunidad_id" = o."id"
       );

    SELECT count(*) INTO sin_foto
      FROM "oportunidades" o
     WHERE o."tenant_id" = t.id
       AND NOT EXISTS (
         SELECT 1 FROM "oportunidad_cambios_etapa" h
          WHERE h."tenant_id" = o."tenant_id" AND h."oportunidad_id" = o."id"
       );
    IF sin_foto > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % oportunidad(es) sin fila en el historial.', t.id, sin_foto;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración: un valor colgado haría que lo que corra después en
  -- esta transacción viera las filas de la última agencia del bucle.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- Validación, después del relleno: comprueba también las filas que acaba de escribir.
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_tenant_id_fkey";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_oportunidad_id_tenant_id_fkey";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_etapa_desde_id_tenant_id_fkey";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_etapa_hasta_id_tenant_id_fkey";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_asesor_id_tenant_id_fkey";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_usuario_id_tenant_id_fkey";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_no_ganada_y_perdida";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_motivo_de_perdida";
ALTER TABLE "oportunidad_cambios_etapa" VALIDATE CONSTRAINT "oportunidad_cambios_etapa_desde_solo_en_cambio";

-- -----------------------------------------------------------------------------
-- 8. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  rol text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- Tabla de negocio, no excepción: tenant_id NOT NULL, RLS habilitada Y forzada, y fuera de
  -- `excepciones_rls`.
  IF NOT (SELECT attnotnull FROM pg_attribute
           WHERE attrelid = 'public.oportunidad_cambios_etapa'::regclass AND attname = 'tenant_id') THEN
    RAISE EXCEPTION 'oportunidad_cambios_etapa.tenant_id no es NOT NULL.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.oportunidad_cambios_etapa'::regclass) THEN
    RAISE EXCEPTION 'oportunidad_cambios_etapa no tiene RLS habilitada y forzada.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'oportunidad_cambios_etapa') THEN
    RAISE EXCEPTION 'oportunidad_cambios_etapa no puede ser una excepcion de RLS.';
  END IF;

  -- Las foráneas: seis, validadas, y todas con `tenant_id` entre sus columnas.
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.oportunidad_cambios_etapa'::regclass
         AND contype = 'f' AND convalidated) <> 6 THEN
    RAISE EXCEPTION 'oportunidad_cambios_etapa no tiene sus seis foraneas validadas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.oportunidad_cambios_etapa'::regclass
       AND c.contype = 'f'
       AND NOT EXISTS (
         SELECT 1 FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
          WHERE a.attname = 'tenant_id')
  ) THEN
    RAISE EXCEPTION 'oportunidad_cambios_etapa tiene una foranea sin tenant_id.';
  END IF;

  -- Los tres CHECK, validados.
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.oportunidad_cambios_etapa'::regclass
         AND contype = 'c' AND convalidated
         AND conname IN ('oportunidad_cambios_etapa_no_ganada_y_perdida',
                         'oportunidad_cambios_etapa_motivo_de_perdida',
                         'oportunidad_cambios_etapa_desde_solo_en_cambio')) <> 3 THEN
    RAISE EXCEPTION 'Falta (o no esta validado) algun CHECK de oportunidad_cambios_etapa.';
  END IF;

  -- Los dos disparadores de solo añadir, activos.
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.oportunidad_cambios_etapa'::regclass
         AND NOT tgisinternal AND tgenabled = 'O'
         AND tgname IN ('oportunidad_cambios_etapa_solo_anadir',
                        'oportunidad_cambios_etapa_sin_truncate')) <> 2 THEN
    RAISE EXCEPTION 'oportunidad_cambios_etapa no tiene sus disparadores de solo anadir activos.';
  END IF;

  -- Los índices, válidos.
  IF (SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
       WHERE i.indrelid = 'public.oportunidad_cambios_etapa'::regclass AND i.indisvalid
         AND x.relname IN ('idx_oportunidad_cambios_etapa_por_oportunidad',
                           'idx_oportunidad_cambios_etapa_por_instante')) <> 2 THEN
    RAISE EXCEPTION 'Faltan los indices de oportunidad_cambios_etapa.';
  END IF;

  -- Los roles de negocio leen e insertan; el de identidad no toca la tabla. Un rol que aún no
  -- existe se omite, igual que en `aplicar_privilegios_declarados`.
  FOREACH rol IN ARRAY ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_webhook'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    -- Uno por uno: con una lista, `has_table_privilege` responde «alguno», no «todos».
    IF NOT (has_table_privilege(rol, 'public.oportunidad_cambios_etapa', 'SELECT')
            AND has_table_privilege(rol, 'public.oportunidad_cambios_etapa', 'INSERT')) THEN
      RAISE EXCEPTION 'El rol % no puede leer o insertar en oportunidad_cambios_etapa.', rol;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_identidad')
     AND has_table_privilege('viajapro_identidad', 'public.oportunidad_cambios_etapa',
                             'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'viajapro_identidad tiene privilegios sobre oportunidad_cambios_etapa.';
  END IF;
END;
$$;
