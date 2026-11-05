-- =============================================================================
-- T-132 — `cotizacion_cambios_estado`: el historial de estados de la cotización
--
-- Hoy `cambiarEstado` solo escribe `estado` (y `enviada_en` al enviar): el instante de ACEPTADA,
-- RECHAZADA o VENCIDA no se guarda en ningún sitio, y `actualizado_en` se mueve con cualquier
-- edición (roadmap de reportes, D3). Sin ese instante no hay «ventas del mes» ni «tiempo hasta la
-- decisión». Lo que no se captura desde hoy no se recupera nunca.
--
-- Qué hace, en orden:
--   1. La tabla, por agencia (tenant_id NOT NULL): una fila por alta (BORRADOR, sin estado de
--      origen) y por cada transición, con el estado de origen, el de destino, quién la hizo y
--      cuándo (UTC).
--   2. Foráneas compuestas con el tenant hacia `cotizaciones` y `usuarios`, NOT VALID + VALIDATE.
--   3. CHECK: solo las transiciones de la máquina de estados (`estado-de-cotizacion.ts`).
--   4. Índices (tenant_id, cotizacion_id, ocurrido_en, id) para la línea de vida y
--      (tenant_id, estado_hasta, ocurrido_en) para «aceptadas/rechazadas del periodo».
--   5. SOLO AÑADIR: el disparador `historial_solo_anadir()` (el mismo de T-131).
--   6. RLS y privilegios por el único mecanismo que los gobierna.
--   7. Cinturón.
--
-- **Sin relleno.** Las cotizaciones anteriores a esta migración quedan SIN filas, a propósito
-- (criterio de T-132): de las finales no se sabe cuándo se decidieron, y una fila con
-- `actualizado_en` o con la hora de la migración afirmaría un instante que nadie registró. El
-- reporte las declara «sin instante de decisión». `enviada_en` sigue en `cotizaciones` para quien
-- necesite el envío de las viejas.
--
-- **Sin datos personales (R10).** Identificadores, dos estados y un instante.
--
-- **Auditoría.** Tabla de hechos de solo añadir: sin `actualizado_en` ni `actualizado_por`.
-- `ocurrido_en` es el `creado_en` y `usuario_id` el `creado_por`.
--
-- **La máquina de estados queda también en la base (§3).** Es invariante del dominio y no
-- política de agencia (R12). El día que cambie (p. ej. reabrir una RECHAZADA), el CHECK se
-- reemplaza en la misma migración que lo permita; sin eso, el INSERT del historial falla y la
-- transición nueva se deshace, que es el fallo ruidoso que se quiere.
--
-- **El `estado_desde IS NOT NULL` del CHECK de §3 NO sobra: no se «simplifica».** Un CHECK solo
-- rechaza FALSE; acepta TRUE y también NULL. Sin esa guarda, `estado_desde` NULL con
-- `estado_hasta = 'ENVIADA'` daba `FALSE OR NULL OR NULL` = NULL y la fila entraba (un alta
-- directamente en ENVIADA). Con la guarda, el segundo bloque es FALSE y el CHECK rechaza. Lo
-- vigila la aserción 81 de `aislamiento.spec.ts`.
--
-- **Segura en caliente.** Tabla nueva y vacía: las foráneas NOT VALID son cambio de catálogo y la
-- validación no recorre nada. `cotizaciones` y `usuarios` reciben un SHARE ROW EXCLUSIVE breve al
-- crear la foránea (bloquea escrituras en ellas durante la transacción de la migración, no
-- lecturas); hoy no hay agencia real. Índices sin CONCURRENTLY: transacción de Prisma, tabla vacía.
--
-- **REVERSIBLE** con una migración posterior:
--   DROP TABLE "cotizacion_cambios_estado";
-- (`historial_solo_anadir()` se queda si otra tabla la usa; si no, DROP FUNCTION.) ANTES hay que
-- desplegar una API que no escriba en la tabla: la actual falla al crear una cotización o cambiar
-- su estado sin ella. Se pierde el historial capturado, que no se puede reconstruir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------
CREATE TABLE "cotizacion_cambios_estado" (
    "id"            UUID                NOT NULL,
    "tenant_id"     UUID                NOT NULL,
    "cotizacion_id" UUID                NOT NULL,
    "estado_desde"  "estado_cotizacion",
    "estado_hasta"  "estado_cotizacion" NOT NULL,
    "usuario_id"    UUID,
    "ocurrido_en"   TIMESTAMPTZ(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotizacion_cambios_estado_pkey" PRIMARY KEY ("id")
);

COMMENT ON TABLE "cotizacion_cambios_estado" IS
  'Historial de estados de la cotización (T-132). Solo añadir: una fila por alta (BORRADOR) y por transición, con quién y cuándo. Las cotizaciones anteriores a la migración no tienen filas (sin instante de decisión). Sin PII.';
COMMENT ON COLUMN "cotizacion_cambios_estado"."estado_desde" IS
  'Nulo solo en el alta (estado_hasta = BORRADOR).';
COMMENT ON COLUMN "cotizacion_cambios_estado"."usuario_id" IS
  'Quién hizo el cambio. Nulo sin usuario (automatización, atajo de desarrollo).';
COMMENT ON COLUMN "cotizacion_cambios_estado"."ocurrido_en" IS
  'Instante del cambio, UTC, en la misma transacción que el UPDATE de la cotización. En ACEPTADA es el instante de la venta.';

-- -----------------------------------------------------------------------------
-- 2. Claves foráneas — compuestas con el tenant, NOT VALID y luego VALIDATE
--
-- RESTRICT y no CASCADE, como `versiones_cotizacion` y `oportunidad_cambios_etapa`: una acción
-- referencial correría como PROPIETARIO, que es media salida del disparador de §5. Una cotización
-- se borra en blando, y la purga de una agencia borra primero el historial.
-- -----------------------------------------------------------------------------
ALTER TABLE "cotizacion_cambios_estado"
  ADD CONSTRAINT "cotizacion_cambios_estado_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "cotizacion_cambios_estado"
  ADD CONSTRAINT "cotizacion_cambios_estado_cotizacion_id_tenant_id_fkey"
  FOREIGN KEY ("cotizacion_id", "tenant_id") REFERENCES "cotizaciones" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "cotizacion_cambios_estado"
  ADD CONSTRAINT "cotizacion_cambios_estado_usuario_id_tenant_id_fkey"
  FOREIGN KEY ("usuario_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 3. Solo las transiciones de la máquina de estados
--
--   (alta) ──► BORRADOR ──► ENVIADA ──► ACEPTADA | RECHAZADA | VENCIDA
-- -----------------------------------------------------------------------------
ALTER TABLE "cotizacion_cambios_estado"
  ADD CONSTRAINT "cotizacion_cambios_estado_transicion_valida"
  CHECK (
    ("estado_desde" IS NULL AND "estado_hasta" = 'BORRADOR')
    OR ("estado_desde" IS NOT NULL AND (
          ("estado_desde" = 'BORRADOR' AND "estado_hasta" = 'ENVIADA')
          OR ("estado_desde" = 'ENVIADA' AND "estado_hasta" IN ('ACEPTADA', 'RECHAZADA', 'VENCIDA'))
        ))
  )
  NOT VALID;

-- -----------------------------------------------------------------------------
-- 4. Índices. El tenant va SIEMPRE primero.
-- -----------------------------------------------------------------------------

-- La línea de vida de una cotización, en orden. `id` (UUID v7) desempata el mismo milisegundo.
CREATE INDEX "idx_cotizacion_cambios_estado_por_cotizacion"
  ON "cotizacion_cambios_estado" ("tenant_id", "cotizacion_id", "ocurrido_en", "id");

-- «Aceptadas (rechazadas, vencidas) en el periodo»: la consulta de ventas del mes.
CREATE INDEX "idx_cotizacion_cambios_estado_por_estado"
  ON "cotizacion_cambios_estado" ("tenant_id", "estado_hasta", "ocurrido_en");

-- Destino de cualquier foránea compuesta futura hacia una fila del historial.
CREATE UNIQUE INDEX "cotizacion_cambios_estado_id_tenant_id_key"
  ON "cotizacion_cambios_estado" ("id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 5. Solo añadir
--
-- Por qué un disparador y no un REVOKE: `aplicar_privilegios_declarados()` vuelve a conceder
-- UPDATE y DELETE sobre todas las tablas en cada migración que la llama, y solo revoca lo que
-- declara `excepciones_rls`, que es para tablas FUERA de RLS. El disparador vale contra cualquier
-- rol y sobrevive a cualquier GRANT. Única salida: la purga de la agencia entera, declarada por
-- el propietario (`viajapro.purga_de_tenants`, como `versiones_cotizacion`).
--
-- La función es la de T-131, con el mismo cuerpo y OR REPLACE: cualquiera de las dos migraciones
-- puede aplicarse primero.
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

CREATE TRIGGER "cotizacion_cambios_estado_solo_anadir"
  BEFORE UPDATE OR DELETE ON "cotizacion_cambios_estado"
  FOR EACH ROW EXECUTE FUNCTION historial_solo_anadir();

CREATE TRIGGER "cotizacion_cambios_estado_sin_truncate"
  BEFORE TRUNCATE ON "cotizacion_cambios_estado"
  FOR EACH STATEMENT EXECUTE FUNCTION historial_solo_anadir();

-- -----------------------------------------------------------------------------
-- 6. RLS y privilegios, por el único mecanismo que los gobierna
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('cotizacion_cambios_estado');
SELECT aplicar_privilegios_declarados();

ALTER TABLE "cotizacion_cambios_estado" VALIDATE CONSTRAINT "cotizacion_cambios_estado_tenant_id_fkey";
ALTER TABLE "cotizacion_cambios_estado" VALIDATE CONSTRAINT "cotizacion_cambios_estado_cotizacion_id_tenant_id_fkey";
ALTER TABLE "cotizacion_cambios_estado" VALIDATE CONSTRAINT "cotizacion_cambios_estado_usuario_id_tenant_id_fkey";
ALTER TABLE "cotizacion_cambios_estado" VALIDATE CONSTRAINT "cotizacion_cambios_estado_transicion_valida";

-- -----------------------------------------------------------------------------
-- 7. Cinturón: lo que esta migración dice haber hecho, comprobado
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

  IF NOT (SELECT attnotnull FROM pg_attribute
           WHERE attrelid = 'public.cotizacion_cambios_estado'::regclass AND attname = 'tenant_id') THEN
    RAISE EXCEPTION 'cotizacion_cambios_estado.tenant_id no es NOT NULL.';
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.cotizacion_cambios_estado'::regclass) THEN
    RAISE EXCEPTION 'cotizacion_cambios_estado no tiene RLS habilitada y forzada.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'cotizacion_cambios_estado') THEN
    RAISE EXCEPTION 'cotizacion_cambios_estado no puede ser una excepcion de RLS.';
  END IF;

  -- Tres foráneas, validadas y todas con `tenant_id` entre sus columnas.
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.cotizacion_cambios_estado'::regclass
         AND contype = 'f' AND convalidated) <> 3 THEN
    RAISE EXCEPTION 'cotizacion_cambios_estado no tiene sus tres foraneas validadas.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.cotizacion_cambios_estado'::regclass
       AND c.contype = 'f'
       AND NOT EXISTS (
         SELECT 1 FROM unnest(c.conkey) k
           JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
          WHERE a.attname = 'tenant_id')
  ) THEN
    RAISE EXCEPTION 'cotizacion_cambios_estado tiene una foranea sin tenant_id.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.cotizacion_cambios_estado'::regclass
                    AND conname = 'cotizacion_cambios_estado_transicion_valida'
                    AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION 'Falta (o no esta validado) el CHECK de transiciones de cotizacion_cambios_estado.';
  END IF;

  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.cotizacion_cambios_estado'::regclass
         AND NOT tgisinternal AND tgenabled = 'O'
         AND tgname IN ('cotizacion_cambios_estado_solo_anadir',
                        'cotizacion_cambios_estado_sin_truncate')) <> 2 THEN
    RAISE EXCEPTION 'cotizacion_cambios_estado no tiene sus disparadores de solo anadir activos.';
  END IF;

  IF (SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
       WHERE i.indrelid = 'public.cotizacion_cambios_estado'::regclass AND i.indisvalid
         AND x.relname IN ('idx_cotizacion_cambios_estado_por_cotizacion',
                           'idx_cotizacion_cambios_estado_por_estado')) <> 2 THEN
    RAISE EXCEPTION 'Faltan los indices de cotizacion_cambios_estado.';
  END IF;

  -- Los roles de negocio leen e insertan (uno por uno: con una lista, `has_table_privilege`
  -- responde «alguno»); el de identidad no toca la tabla. Un rol que aún no existe se omite.
  FOREACH rol IN ARRAY ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_webhook'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF NOT (has_table_privilege(rol, 'public.cotizacion_cambios_estado', 'SELECT')
            AND has_table_privilege(rol, 'public.cotizacion_cambios_estado', 'INSERT')) THEN
      RAISE EXCEPTION 'El rol % no puede leer o insertar en cotizacion_cambios_estado.', rol;
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_identidad')
     AND has_table_privilege('viajapro_identidad', 'public.cotizacion_cambios_estado',
                             'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'viajapro_identidad tiene privilegios sobre cotizacion_cambios_estado.';
  END IF;
END;
$$;
