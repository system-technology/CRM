-- =============================================================================
-- T-250, ADR-0024 — `reserva_cambios_estado`: el historial de estados de la reserva
--
-- `bookings.estado` se sobrescribe y no deja rastro: se pierde quién pasó una reserva a
-- ABONADA_AL_PROVEEDOR o a PAGADA_AL_PROVEEDOR y cuándo (hallazgo BAJO de la auditoría de T-242).
-- Esta tabla guarda una fila por cada cambio de estado, con el estado de origen, el de destino, el
-- usuario y el instante (UTC, R9). Mismo patrón que `oportunidad_cambios_etapa` (T-131) y
-- `cotizacion_cambios_estado` (T-132): la escribe el adaptador del caso de uso en la MISMA
-- transacción que el UPDATE de la reserva (no hay disparador en la base: ver la bitácora).
--
-- Qué hace, en orden:
--   1. La tabla, por agencia (`tenant_id NOT NULL`), con `UNIQUE (id, tenant_id)`.
--   2. Foráneas: con `tenants` en cascada; con el archivo, la reserva y el usuario COMPUESTAS con el
--      tenant (R1). NO ACTION (no RESTRICT) donde la cascada de la agencia se lleva las dos filas en
--      la misma sentencia.
--   3. CHECK: un cambio cambia el estado (`estado_anterior <> estado_nuevo`).
--   4. Índices: la línea de vida de una reserva y la de un archivo, con el tenant siempre primero.
--   5. RLS habilitada y FORZADA con la política canónica (`aplicar_aislamiento_tenant`). No es
--      excepción global.
--   6. `privilegios_declarados`: SOLO `viajapro_app`, SELECT e INSERT. Sin UPDATE ni DELETE: el
--      historial es inmutable para toda la aplicación (la cascada del tenant corre como dueño).
--      A diferencia de las otras dos tablas de historial NO lleva el disparador de solo añadir:
--      aquí el privilegio ya lo impide, y un rol con UPDATE no existe.
--   7. Cinturón: lo dicho, comprobado contra el catálogo.
--
-- **Cero columnas de texto**: identificadores, dos enums y dos instantes. Sin PII (R10) y sin
-- ningún dato de neto (R8): la aserción 83 (COLUMNAS_DE_TEXTO_DECLARADAS) no tiene nada que decidir.
--
-- Sin relleno: las reservas existentes no tienen historia que reconstruir. Su primera fila será su
-- primer cambio. El alta (PENDIENTE) no es un cambio: no se registra (`estado_anterior` es NOT NULL).
--
-- REVERSIBLE con una migración nueva, perdiendo solo el historial:
--   DELETE FROM privilegios_declarados WHERE tabla = 'reserva_cambios_estado';
--   DROP TABLE reserva_cambios_estado;
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La tabla
-- -----------------------------------------------------------------------------
CREATE TABLE "reserva_cambios_estado" (
    "id"              UUID             NOT NULL,
    "tenant_id"       UUID             NOT NULL,
    "reserva_id"      UUID             NOT NULL,
    -- El archivo de la reserva, copiado para la línea de vida del archivo sin unir con `bookings`.
    "archivo_id"      UUID             NOT NULL,
    "estado_anterior" "estado_reserva" NOT NULL,
    "estado_nuevo"    "estado_reserva" NOT NULL,
    -- Quién lo hizo. Nulo sin usuario (atajo de desarrollo, automatización).
    "usuario_id"      UUID,
    "ocurrido_en"     TIMESTAMPTZ(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserva_cambios_estado_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reserva_cambios_estado_cambia_el_estado" CHECK ("estado_anterior" <> "estado_nuevo")
);

COMMENT ON TABLE "reserva_cambios_estado" IS
  'Historial de estados de la reserva (T-250, ADR-0024). Solo añadir: una fila por cambio de estado, con quién y cuándo. Sin alta ni relleno. Sin texto libre ni PII.';
COMMENT ON COLUMN "reserva_cambios_estado"."usuario_id" IS
  'Quién hizo el cambio. Nulo sin usuario.';
COMMENT ON COLUMN "reserva_cambios_estado"."ocurrido_en" IS
  'Instante del cambio, UTC, en la misma transacción que el UPDATE de la reserva.';

CREATE UNIQUE INDEX "reserva_cambios_estado_id_tenant_id_key"
  ON "reserva_cambios_estado" ("id", "tenant_id");
CREATE INDEX "idx_reserva_cambios_estado_por_reserva"
  ON "reserva_cambios_estado" ("tenant_id", "reserva_id", "ocurrido_en", "id");
CREATE INDEX "idx_reserva_cambios_estado_por_archivo"
  ON "reserva_cambios_estado" ("tenant_id", "archivo_id", "ocurrido_en", "id");

-- -----------------------------------------------------------------------------
-- 2. Foráneas
-- -----------------------------------------------------------------------------
ALTER TABLE "reserva_cambios_estado" ADD CONSTRAINT "reserva_cambios_estado_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reserva_cambios_estado" ADD CONSTRAINT "reserva_cambios_estado_reserva_id_tenant_id_fkey"
  FOREIGN KEY ("reserva_id", "tenant_id") REFERENCES "bookings" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "reserva_cambios_estado" ADD CONSTRAINT "reserva_cambios_estado_archivo_id_tenant_id_fkey"
  FOREIGN KEY ("archivo_id", "tenant_id") REFERENCES "travel_files" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "reserva_cambios_estado" ADD CONSTRAINT "reserva_cambios_estado_usuario_id_tenant_id_fkey"
  FOREIGN KEY ("usuario_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 5. RLS habilitada y forzada, política canónica con USING y WITH CHECK
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('reserva_cambios_estado');

-- -----------------------------------------------------------------------------
-- 6. Privilegios declarados (ADR-0024 §5.2): solo `viajapro_app`, SELECT e INSERT
-- -----------------------------------------------------------------------------
INSERT INTO privilegios_declarados (tabla, rol, privilegios, motivo) VALUES
  ('reserva_cambios_estado', 'viajapro_app', '{SELECT,INSERT}',
   'T-250: la API la escribe en la misma transacción que el cambio de estado de la reserva y la lee; el trabajador no la toca. Inmutable: sin UPDATE ni DELETE.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 7. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
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
           WHERE oid = 'public.reserva_cambios_estado'::regclass) THEN
    RAISE EXCEPTION 'reserva_cambios_estado no tiene RLS habilitada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p
                  WHERE p.polrelid = 'public.reserva_cambios_estado'::regclass
                    AND p.polname = 'tenant_isolation'
                    AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) THEN
    RAISE EXCEPTION 'reserva_cambios_estado no tiene la política tenant_isolation con USING y WITH CHECK.';
  END IF;
  IF NOT (SELECT a.attnotnull FROM pg_attribute a
           WHERE a.attrelid = 'public.reserva_cambios_estado'::regclass
             AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'reserva_cambios_estado.tenant_id admite nulos.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'reserva_cambios_estado') THEN
    RAISE EXCEPTION 'reserva_cambios_estado no puede ser una excepción de RLS.';
  END IF;

  -- Cuatro foráneas validadas (tenants y las tres compuestas).
  IF (SELECT count(*) FROM pg_constraint
       WHERE conrelid = 'public.reserva_cambios_estado'::regclass
         AND contype = 'f' AND convalidated) <> 4 THEN
    RAISE EXCEPTION 'reserva_cambios_estado no tiene sus cuatro foráneas validadas.';
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
     AND c.conrelid = 'public.reserva_cambios_estado'::regclass
     AND NOT EXISTS (
       SELECT 1 FROM generate_subscripts(c.conkey, 1) AS i
        WHERE c.conkey[i] = ta.attnum AND c.confkey[i] = pa.attnum
     );
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Foráneas de reserva_cambios_estado que no incluyen tenant_id: %', defectos;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.reserva_cambios_estado'::regclass
                    AND conname = 'reserva_cambios_estado_cambia_el_estado'
                    AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION 'Falta (o no está validado) el CHECK reserva_cambios_estado_cambia_el_estado.';
  END IF;

  IF (SELECT count(*) FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
       WHERE i.indrelid = 'public.reserva_cambios_estado'::regclass AND i.indisvalid
         AND x.relname IN ('idx_reserva_cambios_estado_por_reserva',
                           'idx_reserva_cambios_estado_por_archivo',
                           'reserva_cambios_estado_id_tenant_id_key')) <> 3 THEN
    RAISE EXCEPTION 'Faltan índices de reserva_cambios_estado.';
  END IF;

  -- Cero columnas de texto: la aserción 83 no tiene nada que decidir para esta tabla.
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = 'public.reserva_cambios_estado'::regclass
                AND a.attnum > 0 AND NOT a.attisdropped
                AND format_type(a.atttypid, NULL) IN ('text', 'text[]', 'character varying',
                      'character varying[]', 'character', 'character[]', 'citext', 'citext[]')) THEN
    RAISE EXCEPTION 'reserva_cambios_estado no debe tener columnas de texto.';
  END IF;

  IF EXISTS (SELECT 1 FROM privilegios_declarados d JOIN excepciones_rls e ON e.tabla = d.tabla) THEN
    RAISE EXCEPTION 'Una tabla está a la vez en excepciones_rls y en privilegios_declarados.';
  END IF;

  -- La matriz de privilegios: `viajapro_app` SELECT e INSERT; todos los demás, nada.
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    SELECT COALESCE(array_agg(p ORDER BY p), '{}')
      INTO reales
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
     WHERE has_table_privilege(v_rol, 'public.reserva_cambios_estado', p);
    esperados := CASE WHEN v_rol = 'viajapro_app'
                      THEN ARRAY['INSERT', 'SELECT'] ELSE '{}'::text[] END;
    IF reales IS DISTINCT FROM esperados THEN
      RAISE EXCEPTION 'Privilegios de % sobre reserva_cambios_estado: % (se esperaba %).', v_rol, reales, esperados;
    END IF;
    IF v_rol <> 'viajapro_app'
       AND (has_any_column_privilege(v_rol, 'public.reserva_cambios_estado', 'SELECT')
            OR has_any_column_privilege(v_rol, 'public.reserva_cambios_estado', 'INSERT')
            OR has_any_column_privilege(v_rol, 'public.reserva_cambios_estado', 'UPDATE')) THEN
      RAISE EXCEPTION '% tiene privilegios de columna sobre reserva_cambios_estado.', v_rol;
    END IF;
  END LOOP;
  -- Ni siquiera `viajapro_app` tiene UPDATE por columna.
  IF has_any_column_privilege('viajapro_app', 'public.reserva_cambios_estado', 'UPDATE') THEN
    RAISE EXCEPTION 'viajapro_app puede actualizar columnas de reserva_cambios_estado.';
  END IF;

  IF has_table_privilege('public', 'public.reserva_cambios_estado', 'SELECT') THEN
    RAISE EXCEPTION 'PUBLIC puede leer reserva_cambios_estado.';
  END IF;
END;
$$;
