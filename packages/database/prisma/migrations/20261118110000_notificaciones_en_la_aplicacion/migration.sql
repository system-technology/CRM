-- =============================================================================
-- T-254 — ADR-0024 §3.6 y «Cola»: las notificaciones en la aplicación (`notifications`)
--
-- El asesor tiene que ENTERARSE de los cuatro avisos de plazo que `booking` ya escribe en el
-- outbox (`booking.time_limit_proximo|vencido`, `booking.pago_total_proximo|vencido`). Esta
-- migración crea la única tabla que eso exige: la bandeja de avisos de cada usuario de la agencia.
-- Es del contexto `notifications` («plantillas, preferencias, envíos, notificaciones en la
-- aplicación», docs/02-arquitectura/02-contextos-delimitados.md): ningún contexto existente la
-- tenía, y no cambia la forma del sistema más allá de ADR-0024 (el consumidor es el despachador
-- de §1; la tabla es una más de agencia, como `entregas_de_eventos`).
--
-- Qué hace, en orden:
--   1. El enum `tipo_notificacion`, con los cuatro avisos de plazo. Un tipo nuevo de aviso será
--      `ALTER TYPE ... ADD VALUE`.
--   2. `notificaciones`: `tenant_id NOT NULL`, una fila por (evento, destinatario), foráneas
--      COMPUESTAS con el tenant hacia `usuarios`, `travel_files`, `bookings` y `outbox`, y los
--      índices de la lista («mis notificaciones», las no leídas primero).
--   3. RLS habilitada y FORZADA con la política canónica (`aplicar_aislamiento_tenant`). No es
--      excepción global (R1).
--   4. `privilegios_declarados`: SOLO `viajapro_app`, SELECT, INSERT y UPDATE. Sin DELETE: una
--      notificación se marca leída, no se borra (la cascada del tenant corre como dueño).
--   5. Cinturón: lo dicho, comprobado contra el catálogo. Las mismas aserciones están en
--      `tests/aislamiento.spec.ts` («T-254»).
--
-- **Cero columnas de texto.** La notificación guarda IDENTIFICADORES, el número de file (un entero,
-- para pintar «file 1043» sin leer las tablas de `booking`, R4), el tipo (enum) y dos instantes. No
-- copia destino, mayorista ni nombres de pasajeros: la pantalla de Reservas, a la que la
-- notificación apunta con `archivo_id`, es quien los muestra y quien los protege con `archivo.ver`.
-- Por eso la aserción 83 (COLUMNAS_DE_TEXTO_DECLARADAS) no tiene nada nuevo que decidir.
--
-- Idempotencia: `UNIQUE (tenant_id, outbox_id, usuario_id)`. Un evento produce UNA notificación por
-- destinatario aunque el despachador lo entregue dos veces. `outbox_id` es anulable con
-- `ON DELETE SET NULL ("outbox_id")`: si algún día se purga el outbox, la notificación sobrevive
-- (la clave nombra SOLO esa columna: a secas anularía también `tenant_id`, 20261013230000 §4); los
-- NULL no chocan entre sí en el UNIQUE, y un evento purgado ya no se vuelve a entregar.
--
-- Orden con el despliegue: tabla nueva y privilegios nuevos; nada existente cambia. La API que la
-- usa sale DESPUÉS de esta migración (migrar y luego arrancar, como siempre).
--
-- REVERSIBLE con una migración nueva, sin pérdida para el negocio (solo se pierden los avisos ya
-- mostrados; los eventos siguen en el outbox):
--   DELETE FROM privilegios_declarados WHERE tabla = 'notificaciones';
--   DROP TABLE notificaciones;
--   DROP TYPE tipo_notificacion;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El enum
-- -----------------------------------------------------------------------------
CREATE TYPE "tipo_notificacion" AS ENUM (
  'TIME_LIMIT_PROXIMO',
  'TIME_LIMIT_VENCIDO',
  'PAGO_TOTAL_PROXIMO',
  'PAGO_TOTAL_VENCIDO'
);

-- -----------------------------------------------------------------------------
-- 2. `notificaciones`
-- -----------------------------------------------------------------------------
CREATE TABLE "notificaciones" (
    "id"             UUID           NOT NULL,
    "tenant_id"      UUID           NOT NULL,
    -- El destinatario: el usuario de la agencia que la ve. Solo él la lista y la marca.
    "usuario_id"     UUID           NOT NULL,
    "tipo"           "tipo_notificacion" NOT NULL,
    -- El evento que la originó (idempotencia). Anulable: ver el encabezado.
    "outbox_id"      BIGINT,
    -- A qué apunta: el archivo y la reserva del aviso.
    "archivo_id"     UUID           NOT NULL,
    "reserva_id"     UUID           NOT NULL,
    -- Copia del número legible del file: un entero, no PII.
    "archivo_numero" INTEGER        NOT NULL,
    -- El plazo vigilado (UTC, R9): el de `AvisoDePlazoV1.venceEn`.
    "vence_en"       TIMESTAMPTZ(3) NOT NULL,
    "leida_en"       TIMESTAMPTZ(3),
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "notificaciones_archivo_numero_positivo" CHECK ("archivo_numero" > 0)
);

COMMENT ON TABLE "notificaciones" IS
  'Notificación en la aplicación para un usuario de la agencia (contexto notifications). T-254, ADR-0024 §3.6. Una por (evento, destinatario). Sin texto libre ni PII: ids, número de file, tipo y plazo.';

-- Destino de futuras foráneas compuestas, y la regla de «un evento, una notificación por usuario».
CREATE UNIQUE INDEX "notificaciones_id_tenant_id_key" ON "notificaciones" ("id", "tenant_id");
CREATE UNIQUE INDEX "notificaciones_tenant_id_outbox_id_usuario_id_key"
  ON "notificaciones" ("tenant_id", "outbox_id", "usuario_id");
-- La lista de un usuario, la más reciente primero.
CREATE INDEX "notificaciones_tenant_id_usuario_id_creado_en_idx"
  ON "notificaciones" ("tenant_id", "usuario_id", "creado_en" DESC);
-- Parcial: las no leídas son una fracción pequeña y es lo que la campana cuenta.
CREATE INDEX "notificaciones_no_leidas_idx" ON "notificaciones" ("tenant_id", "usuario_id")
  WHERE "leida_en" IS NULL;
CREATE INDEX "notificaciones_tenant_id_archivo_id_idx" ON "notificaciones" ("tenant_id", "archivo_id");
CREATE INDEX "notificaciones_tenant_id_reserva_id_idx" ON "notificaciones" ("tenant_id", "reserva_id");

-- Foráneas: con `tenants` en cascada; entre tablas de agencia SIEMPRE compuestas con el tenant.
-- NO ACTION (no RESTRICT) donde la cascada del tenant se lleva las dos filas en la misma sentencia.
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_usuario_id_tenant_id_fkey"
  FOREIGN KEY ("usuario_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_archivo_id_tenant_id_fkey"
  FOREIGN KEY ("archivo_id", "tenant_id") REFERENCES "travel_files" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_reserva_id_tenant_id_fkey"
  FOREIGN KEY ("reserva_id", "tenant_id") REFERENCES "bookings" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_outbox_id_tenant_id_fkey"
  FOREIGN KEY ("outbox_id", "tenant_id") REFERENCES "outbox" ("id", "tenant_id")
  ON DELETE SET NULL ("outbox_id") ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. RLS habilitada y forzada, política canónica con USING y WITH CHECK
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('notificaciones');

-- -----------------------------------------------------------------------------
-- 4. Privilegios declarados (ADR-0024 §5.2): solo `viajapro_app`
-- -----------------------------------------------------------------------------
INSERT INTO privilegios_declarados (tabla, rol, privilegios, motivo) VALUES
  ('notificaciones', 'viajapro_app', '{SELECT,INSERT,UPDATE}',
   'T-254: las escribe el consumidor del despachador y las lee y marca la API, ambos con viajapro_app; el trabajador no las toca. Sin DELETE: se marcan leídas.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_rol text;
  reales text[];
  esperados text[];
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.notificaciones'::regclass) THEN
    RAISE EXCEPTION 'notificaciones no tiene RLS habilitada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p
                  WHERE p.polrelid = 'public.notificaciones'::regclass
                    AND p.polname = 'tenant_isolation'
                    AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) THEN
    RAISE EXCEPTION 'notificaciones no tiene la política tenant_isolation con USING y WITH CHECK.';
  END IF;
  IF NOT (SELECT a.attnotnull FROM pg_attribute a
           WHERE a.attrelid = 'public.notificaciones'::regclass
             AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'notificaciones.tenant_id admite nulos.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'notificaciones') THEN
    RAISE EXCEPTION 'notificaciones no puede ser una excepción de RLS.';
  END IF;

  -- Toda foránea de la tabla hacia otra tabla con tenant_id empareja el tenant en la misma posición.
  SELECT string_agg(DISTINCT c.conname, ', ')
    INTO defectos
    FROM pg_constraint c
    JOIN pg_attribute ta ON ta.attrelid = c.conrelid AND ta.attname = 'tenant_id'
                        AND ta.attnum > 0 AND NOT ta.attisdropped
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attname = 'tenant_id'
                        AND pa.attnum > 0 AND NOT pa.attisdropped
   WHERE c.contype = 'f'
     AND c.conrelid = 'public.notificaciones'::regclass
     AND NOT EXISTS (
       SELECT 1 FROM generate_subscripts(c.conkey, 1) AS i
        WHERE c.conkey[i] = ta.attnum AND c.confkey[i] = pa.attnum
     );
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Foráneas de notificaciones que no incluyen tenant_id: %', defectos;
  END IF;

  -- El SET NULL del evento anula SOLO outbox_id, nunca tenant_id.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'notificaciones_outbox_id_tenant_id_fkey'
       AND c.conrelid = 'public.notificaciones'::regclass
       AND c.confdeltype = 'n'
       AND c.confdelsetcols = ARRAY[(SELECT attnum FROM pg_attribute
                                      WHERE attrelid = 'public.notificaciones'::regclass
                                        AND attname = 'outbox_id')]::int2[]
  ) THEN
    RAISE EXCEPTION 'notificaciones_outbox_id_tenant_id_fkey no es SET NULL ("outbox_id").';
  END IF;

  IF EXISTS (SELECT 1 FROM privilegios_declarados d JOIN excepciones_rls e ON e.tabla = d.tabla) THEN
    RAISE EXCEPTION 'Una tabla está a la vez en excepciones_rls y en privilegios_declarados.';
  END IF;

  -- La matriz de privilegios: `viajapro_app` SELECT, INSERT, UPDATE; todos los demás, nada.
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    SELECT COALESCE(array_agg(p ORDER BY p), '{}')
      INTO reales
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
     WHERE has_table_privilege(v_rol, 'public.notificaciones', p);
    esperados := CASE WHEN v_rol = 'viajapro_app'
                      THEN ARRAY['INSERT', 'SELECT', 'UPDATE'] ELSE '{}'::text[] END;
    IF reales IS DISTINCT FROM esperados THEN
      RAISE EXCEPTION 'Privilegios de % sobre notificaciones: % (se esperaba %).', v_rol, reales, esperados;
    END IF;
    IF v_rol <> 'viajapro_app'
       AND (has_any_column_privilege(v_rol, 'public.notificaciones', 'SELECT')
            OR has_any_column_privilege(v_rol, 'public.notificaciones', 'INSERT')
            OR has_any_column_privilege(v_rol, 'public.notificaciones', 'UPDATE')) THEN
      RAISE EXCEPTION '% tiene privilegios de columna sobre notificaciones.', v_rol;
    END IF;
  END LOOP;

  IF has_table_privilege('public', 'public.notificaciones', 'SELECT') THEN
    RAISE EXCEPTION 'PUBLIC puede leer notificaciones.';
  END IF;
END;
$$;
