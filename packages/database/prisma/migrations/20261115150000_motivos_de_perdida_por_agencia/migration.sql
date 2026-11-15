-- =============================================================================
-- T-214 — los motivos de pérdida pasan a tabla por agencia (R12), con compatibilidad
--
-- `motivo_perdida` era enum del motor (20261010210000 §1), con el argumento de que una taxonomía
-- común permite comparar agencias. R12 decide lo contrario para la política de negocio: cada
-- agencia pierde por motivos propios («el hotel no aceptó mascotas», «visa negada»), y un enum no
-- se lo permite sin una migración. Las dos cosas caben: la tabla lleva `clave`, que en los siete
-- motivos sembrados es EXACTAMENTE el valor del enum de hoy (la taxonomía común sigue existiendo
-- y se compara por clave), y es NULA en los que cree la agencia, como `roles.clave` y
-- `etapas_pipeline.clave`.
--
-- Qué hace, en orden:
--   1. `motivos_de_perdida` (tenant_id NOT NULL, clave, etiqueta, orden, activo, exige_nota y
--      auditoría), con sus unicidades y foráneas compuestas con el tenant.
--   2. RLS y privilegios por el único mecanismo que los gobierna.
--   3. Siembra, agencia por agencia, de los siete motivos del enum con las etiquetas que hoy
--      muestra la web (`NOMBRES_MOTIVOS_PERDIDA`). `OTRO` lleva `exige_nota`: es la regla de
--      `oportunidades_motivo_otro_exige_nota` escrita como dato.
--   4. `oportunidades.motivo_perdida_id` (anulable), rellenado desde el enum agencia por agencia,
--      con foránea COMPUESTA (motivo_perdida_id, tenant_id) e índice (tenant_id, motivo_perdida_id).
--   5. COMPATIBILIDAD: la columna enum `motivo_perdida` se QUEDA y sigue siendo la que escribe la
--      API (contrato, casos de uso y web no cambian en esta migración). Un disparador mantiene
--      `motivo_perdida_id` = el motivo de la agencia con `clave = motivo_perdida`, y un CHECK
--      exige que las dos vayan juntas. Si la agencia no tiene ese motivo (una agencia creada a
--      mano, sin siembra), el disparador lo crea con la etiqueta canónica: así ningún camino de
--      escritura existente puede romperse por esta migración.
--   6. Cinturón.
--
-- **Lo que NO hace (siguiente paso, backend + frontend).** El contrato sigue exponiendo el enum
-- `MotivoPerdida`; listar/gestionar motivos por agencia, aceptar `motivoPerdidaId` y pintar la
-- lista en la web quedan fuera. Cuando la API escriba `motivo_perdida_id`, una migración posterior
-- retira el disparador, el CHECK de pareja y la columna enum, y traslada la regla de `OTRO` a
-- `exige_nota` (validada en el caso de uso o en un disparador). `oportunidad_cambios_etapa`
-- (historial de SOLO AÑADIR) conserva su columna enum: no se puede rellenar una columna nueva sin
-- UPDATE, que su disparador rechaza a todos; el siguiente paso decide si gana una columna nueva
-- para las filas futuras.
--
-- **Sin datos personales (R10).** Etiquetas de catálogo de la agencia, no del viajero.
--
-- **Segura en caliente.** Tabla nueva. `ADD COLUMN` anulable sin DEFAULT es catálogo. El relleno
-- es un UPDATE por agencia sobre `oportunidades`, que hoy tiene decenas de filas (no hay agencia
-- real, CLAUDE.md §1); con volumen iría por lotes en una migración aparte. La foránea y el CHECK
-- entran NOT VALID y se validan aparte (SHARE UPDATE EXCLUSIVE). El índice va sin CONCURRENTLY
-- porque Prisma corre la migración en una transacción (mismo criterio que 20261104140000).
--
-- **REVERSIBLE** con una migración posterior (sin pérdida: el enum sigue siendo la verdad):
--   DROP TRIGGER "oportunidades_motivo_de_perdida_desde_enum" ON "oportunidades";
--   DROP FUNCTION public.motivo_de_perdida_desde_enum();
--   ALTER TABLE "oportunidades" DROP CONSTRAINT "oportunidades_motivo_perdida_pareja",
--     DROP COLUMN "motivo_perdida_id";            -- se lleva su foránea y su índice
--   DROP TABLE "motivos_de_perdida";
-- Lo que se pierde son las etiquetas, el orden y los motivos propios que hayan creado las agencias.
-- =============================================================================

-- uuid v7 en SQL, solo para la siembra (la aplicación los genera con Prisma). OR REPLACE: otras
-- migraciones crean la misma en `pg_temp`, y la aserción 23 las corre todas en la misma sesión.
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
-- -----------------------------------------------------------------------------
CREATE TABLE "motivos_de_perdida" (
    "id"              UUID           NOT NULL,
    "tenant_id"       UUID           NOT NULL,
    -- La taxonomía común: el valor del enum de hoy en los siete sembrados; NULA en los propios
    -- de la agencia. Identifica al sembrado aunque la agencia cambie la etiqueta.
    "clave"           VARCHAR(32),
    "etiqueta"        VARCHAR(80)    NOT NULL,
    "orden"           SMALLINT       NOT NULL,
    -- Retirar un motivo es desactivarlo: las oportunidades que lo usaron lo siguen apuntando.
    "activo"          BOOLEAN        NOT NULL DEFAULT true,
    -- Elegirlo exige explicar en `oportunidades.nota_perdida` (hoy, `OTRO`).
    "exige_nota"      BOOLEAN        NOT NULL DEFAULT false,
    "creado_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"  TIMESTAMPTZ(3) NOT NULL,
    "creado_por"      UUID,
    "actualizado_por" UUID,

    CONSTRAINT "motivos_de_perdida_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "motivos_de_perdida_clave_formato"
      CHECK ("clave" IS NULL OR "clave" ~ '^[A-Z][A-Z0-9_]*$'),
    CONSTRAINT "motivos_de_perdida_etiqueta_no_vacia" CHECK (length(btrim("etiqueta")) > 0),
    CONSTRAINT "motivos_de_perdida_orden_no_negativo" CHECK ("orden" >= 0)
);

COMMENT ON TABLE "motivos_de_perdida" IS
  'Por qué se pierde una oportunidad, por agencia (R12, T-214). clave = taxonomía común (los siete sembrados, = enum motivo_perdida); NULL en los propios de la agencia.';

CREATE UNIQUE INDEX "motivos_de_perdida_tenant_id_clave_key" ON "motivos_de_perdida" ("tenant_id", "clave");
CREATE UNIQUE INDEX "motivos_de_perdida_tenant_id_etiqueta_key" ON "motivos_de_perdida" ("tenant_id", "etiqueta");
-- Destino de la foránea compuesta de `oportunidades`.
CREATE UNIQUE INDEX "motivos_de_perdida_id_tenant_id_key" ON "motivos_de_perdida" ("id", "tenant_id");
-- La lista que pinta la web: por agencia, en orden.
CREATE INDEX "motivos_de_perdida_tenant_id_orden_idx" ON "motivos_de_perdida" ("tenant_id", "orden");

ALTER TABLE "motivos_de_perdida" ADD CONSTRAINT "motivos_de_perdida_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "motivos_de_perdida" ADD CONSTRAINT "motivos_de_perdida_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "motivos_de_perdida" ADD CONSTRAINT "motivos_de_perdida_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 2. RLS y privilegios, por el único mecanismo que los gobierna
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('motivos_de_perdida');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 3 y 4. Siembra y relleno, agencia por agencia
--
-- Con `app.current_tenant`: las dos tablas tienen RLS FORZADA y, con un rol de migraciones sin
-- BYPASSRLS, una sentencia sin contexto vería cero filas y terminaría en verde sin hacer nada
-- (mismo motivo que 20261104150000). Cada vuelta comprueba su resultado.
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidades" ADD COLUMN "motivo_perdida_id" UUID;

COMMENT ON COLUMN "oportunidades"."motivo_perdida_id" IS
  'T-214: el motivo de la agencia (motivos_de_perdida). Mientras la API escriba el enum motivo_perdida, lo mantiene el disparador oportunidades_motivo_de_perdida_desde_enum.';

DO $$
DECLARE
  t record;
  sembrados integer;
  sin_motivo integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    INSERT INTO "motivos_de_perdida"
      ("id", "tenant_id", "clave", "etiqueta", "orden", "exige_nota", "actualizado_en")
    SELECT pg_temp.uuid_v7(), t.id, v.clave, v.etiqueta, v.orden, v.exige_nota, now()
      FROM (VALUES
        ('PRECIO',                 'Precio alto frente a presupuesto',          0, false),
        ('TIEMPO_DE_RESPUESTA',    'Tiempo de respuesta tardío (SLA)',          1, false),
        ('SIN_DISPONIBILIDAD',     'Sin disponibilidad en fechas / cupos',      2, false),
        ('COMPRO_EN_OTRA_AGENCIA', 'Compró con otra agencia',                   3, false),
        ('VIAJE_APLAZADO',         'Viaje aplazado o cancelado por el cliente', 4, false),
        ('NO_RESPONDE',            'Cliente dejó de responder',                 5, false),
        ('OTRO',                   'Otro motivo (especificar)',                 6, true)
      ) AS v(clave, etiqueta, orden, exige_nota)
    ON CONFLICT DO NOTHING;

    SELECT count(*) INTO sembrados
      FROM "motivos_de_perdida"
     WHERE "tenant_id" = t.id
       AND "clave" IN (SELECT unnest(enum_range(NULL::"motivo_perdida"))::text);
    IF sembrados <> cardinality(enum_range(NULL::"motivo_perdida")) THEN
      RAISE EXCEPTION 'La agencia % quedó con % de % motivos sembrados.',
        t.id, sembrados, cardinality(enum_range(NULL::"motivo_perdida"));
    END IF;

    UPDATE "oportunidades" o
       SET "motivo_perdida_id" = m."id"
      FROM "motivos_de_perdida" m
     WHERE o."tenant_id" = t.id
       AND m."tenant_id" = t.id
       AND o."motivo_perdida" IS NOT NULL
       AND m."clave" = o."motivo_perdida"::text;

    SELECT count(*) INTO sin_motivo
      FROM "oportunidades"
     WHERE "tenant_id" = t.id
       AND ("motivo_perdida" IS NULL) <> ("motivo_perdida_id" IS NULL);
    IF sin_motivo > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene % oportunidad(es) con el motivo sin trasladar.', t.id, sin_motivo;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración (ver 20261115130000 §0).
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4 (cont.). Foránea compuesta, índice y la pareja enum/id, en dos pasos
--
-- NO ACTION y no RESTRICT, como `usuarios → roles`: al borrar un tenant la cascada se lleva
-- oportunidades y motivos en la misma sentencia, y RESTRICT se comprobaría a mitad de ella.
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_motivo_perdida_id_tenant_id_fkey"
  FOREIGN KEY ("motivo_perdida_id", "tenant_id") REFERENCES "motivos_de_perdida" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT
  NOT VALID;

-- Mientras dure la compatibilidad: el enum y el id van juntos o no van.
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_motivo_perdida_pareja"
  CHECK (("motivo_perdida" IS NULL) = ("motivo_perdida_id" IS NULL))
  NOT VALID;

ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_motivo_perdida_id_tenant_id_fkey";
ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_motivo_perdida_pareja";

-- Pérdidas por motivo (reportes) y la comprobación de la foránea al desactivar/borrar un motivo.
CREATE INDEX "oportunidades_tenant_id_motivo_perdida_id_idx"
  ON "oportunidades" ("tenant_id", "motivo_perdida_id");

-- -----------------------------------------------------------------------------
-- 5. El disparador de compatibilidad
--
-- SECURITY INVOKER (no DEFINER): corre con el rol y el `app.current_tenant` de quien escribe, así
-- que la búsqueda y, si hace falta, la creación del motivo pasan por la misma RLS. Si NEW.tenant_id
-- no es la agencia del contexto, no encuentra nada, el INSERT del motivo lo rechaza el WITH CHECK
-- y la escritura falla: no puede colgar una oportunidad del motivo de otra agencia.
--
-- Se dispara también con `UPDATE OF motivo_perdida_id`: escribir el id a mano lo recalcula desde
-- el enum, que es la verdad mientras dure la compatibilidad.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.motivo_de_perdida_desde_enum()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $func$
DECLARE
  v_clave text;
  v_id uuid;
BEGIN
  IF NEW.motivo_perdida IS NULL THEN
    NEW.motivo_perdida_id := NULL;
    RETURN NEW;
  END IF;

  v_clave := NEW.motivo_perdida::text;

  SELECT m.id INTO v_id
    FROM public.motivos_de_perdida m
   WHERE m.tenant_id = NEW.tenant_id AND m.clave = v_clave;

  IF v_id IS NULL THEN
    -- Agencia sin siembra (creada a mano o por una prueba): el motivo canónico, creado aquí.
    INSERT INTO public.motivos_de_perdida
      (id, tenant_id, clave, etiqueta, orden, exige_nota, actualizado_en)
    VALUES (
      -- uuid v7: milisegundos sobre los 48 bits altos de un v4, con la versión puesta a 7.
      -- `overlay` y `substring` van sin cualificar porque son sintaxis SQL (PLACING, FROM): el
      -- analizador ya los resuelve a pg_catalog, con o sin search_path.
      pg_catalog.encode(
        pg_catalog.set_bit(pg_catalog.set_bit(
          overlay(pg_catalog.uuid_send(pg_catalog.gen_random_uuid())
            PLACING substring(pg_catalog.int8send(
              pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.clock_timestamp()) * 1000)::bigint) FROM 3)
            FROM 1 FOR 6),
          52, 1), 53, 1),
        'hex')::uuid,
      NEW.tenant_id,
      v_clave,
      CASE v_clave
        WHEN 'PRECIO'                 THEN 'Precio alto frente a presupuesto'
        WHEN 'TIEMPO_DE_RESPUESTA'    THEN 'Tiempo de respuesta tardío (SLA)'
        WHEN 'SIN_DISPONIBILIDAD'     THEN 'Sin disponibilidad en fechas / cupos'
        WHEN 'COMPRO_EN_OTRA_AGENCIA' THEN 'Compró con otra agencia'
        WHEN 'VIAJE_APLAZADO'         THEN 'Viaje aplazado o cancelado por el cliente'
        WHEN 'NO_RESPONDE'            THEN 'Cliente dejó de responder'
        WHEN 'OTRO'                   THEN 'Otro motivo (especificar)'
        ELSE v_clave
      END,
      pg_catalog.array_position(pg_catalog.enum_range(NULL::public.motivo_perdida), NEW.motivo_perdida) - 1,
      v_clave = 'OTRO',
      pg_catalog.now()
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_id;

    -- Otra transacción lo creó a la vez: ahora sí existe.
    IF v_id IS NULL THEN
      SELECT m.id INTO v_id
        FROM public.motivos_de_perdida m
       WHERE m.tenant_id = NEW.tenant_id AND m.clave = v_clave;
    END IF;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'La agencia % no tiene el motivo de pérdida % y no se pudo crear (¿etiqueta repetida?).',
        NEW.tenant_id, v_clave
        USING ERRCODE = 'foreign_key_violation';
    END IF;
  END IF;

  NEW.motivo_perdida_id := v_id;
  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION public.motivo_de_perdida_desde_enum() FROM PUBLIC;
COMMENT ON FUNCTION public.motivo_de_perdida_desde_enum() IS
  'T-214, compatibilidad: mantiene oportunidades.motivo_perdida_id desde el enum motivo_perdida. SECURITY INVOKER (bajo RLS). Se retira cuando la API escriba el id.';

CREATE TRIGGER "oportunidades_motivo_de_perdida_desde_enum"
  BEFORE INSERT OR UPDATE OF "motivo_perdida", "motivo_perdida_id" ON "oportunidades"
  FOR EACH ROW EXECUTE FUNCTION public.motivo_de_perdida_desde_enum();

-- `oportunidades` ya estaba aislada; reaplicar es idempotente y deja constancia de que la
-- política no cambia con la columna nueva.
SELECT aplicar_aislamiento_tenant('oportunidades');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 6. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
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

  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.motivos_de_perdida'::regclass) THEN
    RAISE EXCEPTION 'motivos_de_perdida no tiene RLS habilitada y forzada.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'motivos_de_perdida') THEN
    RAISE EXCEPTION 'motivos_de_perdida no puede ser una excepción de RLS.';
  END IF;

  IF (SELECT count(*) FROM pg_constraint
       WHERE convalidated
         AND conname IN ('oportunidades_motivo_perdida_id_tenant_id_fkey',
                         'oportunidades_motivo_perdida_pareja')
         AND conrelid = 'public.oportunidades'::regclass) <> 2 THEN
    RAISE EXCEPTION 'Falta (o no esta validada) la foránea o la pareja del motivo de pérdida.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.oportunidades'::regclass
                    AND tgname = 'oportunidades_motivo_de_perdida_desde_enum'
                    AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Falta el disparador de compatibilidad del motivo de pérdida.';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.motivo_de_perdida_desde_enum()'::regprocedure) THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum no puede ser SECURITY DEFINER: correría sin RLS de agencia.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_identidad')
     AND has_table_privilege('viajapro_identidad', 'public.motivos_de_perdida', 'SELECT') THEN
    RAISE EXCEPTION 'viajapro_identidad puede leer motivos_de_perdida.';
  END IF;
END;
$$;
