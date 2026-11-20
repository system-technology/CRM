-- =============================================================================
-- T-256 y T-257 — la reserva atada a SU archivo, y `ocurrido_en` lo pone la base
--
-- Dos hallazgos BAJOS de las auditorías de T-254 y de T-250/T-251, en una sola migración porque
-- tocan las mismas dos tablas:
--
--   a) `notificaciones` y `reserva_cambios_estado` guardan `reserva_id` y `archivo_id` con dos
--      foráneas SEPARADAS, cada una compuesta con el tenant. Eso impide apuntar a otra agencia, pero
--      no impide que la fila diga «reserva R del archivo F» cuando R es de otro archivo F' de la
--      MISMA agencia. Hoy solo lo impide el puerto de `booking`. Desde aquí lo impide la base.
--   b) `reserva_cambios_estado.ocurrido_en` tiene DEFAULT, pero `viajapro_app` puede escribirlo:
--      un historial cuyo «cuándo» lo elige quien escribe no prueba nada.
--
-- Qué hace, en orden:
--   1. `bookings_id_travel_file_id_tenant_id_key`: UNIQUE (id, travel_file_id, tenant_id). Trivial
--      sobre los datos (`id` ya es la clave primaria): existe para ser destino de foráneas, igual que
--      `oportunidades_id_contacto_id_tenant_id_key` para `seguimientos` y `travel_files`.
--   2. Comprobación previa, agencia por agencia con `app.current_tenant` (las tres tablas tienen RLS
--      FORZADA y el rol de migraciones puede no tener BYPASSRLS: sin contexto contaría cero y
--      pasaría en verde): si una notificación o una fila del historial nombra una reserva que no es
--      de su archivo, la migración ABORTA y dice cuál, en qué agencia y cuántas. No se corrige nada
--      a ciegas: cuál de las dos columnas miente lo decide una persona.
--   3. En cada tabla, UNA foránea `(reserva_id, archivo_id, tenant_id) → bookings (id,
--      travel_file_id, tenant_id)` en lugar de las dos separadas. Entra NOT VALID y se valida aparte
--      (el VALIDATE también la comprueba contra todas las filas, sin RLS: las comprobaciones de
--      integridad referencial no la aplican). Mismas acciones que la foránea de reserva que
--      sustituye: ON DELETE NO ACTION (la cascada del tenant se lleva las dos filas en la misma
--      sentencia) y ON UPDATE RESTRICT. Las tres columnas son NOT NULL en las dos tablas, como ya
--      lo eran.
--      **La foránea al archivo se va.** No hace falta: la nueva exige que el archivo sea el de la
--      reserva, y `bookings_travel_file_id_tenant_id_fkey` exige que ese archivo exista en la
--      agencia; borrar el archivo lo sigue impidiendo la reserva, que lo retiene (NO ACTION). Es lo
--      que pide T-256: una sola foránea en lugar de las dos.
--      Efecto lateral, deseado: con la reserva referenciada, cambiar `bookings.travel_file_id` falla
--      (ON UPDATE RESTRICT). Nadie lo hace; una reserva no se muda de archivo.
--   4. `reserva_cambios_estado`: un disparador BEFORE INSERT pone `ocurrido_en := now()` en cada fila
--      nueva, diga lo que diga el INSERT (`fijar_ocurrido_en_de_la_base()`, genérica, sin SECURITY
--      DEFINER, `search_path` vacío, sin EXECUTE para PUBLIC). `now()` es lo mismo que el DEFAULT
--      (`CURRENT_TIMESTAMP`): el instante de la transacción que también hace el UPDATE de la reserva.
--      **Por qué un disparador y no INSERT por columnas.** `privilegios_declarados` declara
--      privilegios de TABLA, y `aplicar_privilegios_declarados()` hace REVOKE ALL + GRANT de tabla
--      en cada migración que la llama: un GRANT INSERT (columnas) escrito aquí lo borraría la
--      siguiente (REVOKE ALL también revoca los de columna), sin aviso. Darle columnas a la
--      declaración cambiaría su forma (ADR-0024 §5.2), y no hace falta para esto. Además el
--      disparador no rompe a un cliente que mande la columna (Prisma con `@default(now())`): la
--      ignora, que es justo lo que se quiere. Vale también para el propietario: un relleno futuro
--      con instantes históricos tendría que desactivarlo en su propia migración, a la vista.
--      La inmutabilidad no cambia: `viajapro_app` sigue con SELECT e INSERT y nada más (UPDATE,
--      DELETE y TRUNCATE dan 42501); no se toca `privilegios_declarados`.
--   5. Cinturón: lo dicho, comprobado contra el catálogo. Las mismas aserciones están en
--      `tests/aislamiento.spec.ts` (N-2, N-5, H-2, H-6, H-8).
--
-- **Segura en caliente, con la salvedad de siempre.** Prisma corre el archivo en UNA transacción:
-- el índice único se crea sin CONCURRENTLY (bloquea escrituras en `bookings` mientras se construye)
-- y añadir las foráneas toma SHARE ROW EXCLUSIVE sobre `bookings`, `notificaciones` y
-- `reserva_cambios_estado` hasta el COMMIT. Hoy no importa: no hay agencia real y las tres tablas
-- tienen decenas de filas. Con volumen se partiría en dos migraciones (índice CONCURRENTLY aparte).
--
-- Orden con el despliegue: la API actual ya escribe archivo y reserva coherentes (los lee del mismo
-- agregado) y no manda `ocurrido_en`; ningún código cambia por esta migración.
--
-- REVERSIBLE con una migración nueva, sin pérdida de datos:
--   DROP TRIGGER "reserva_cambios_estado_ocurrido_en_de_la_base" ON "reserva_cambios_estado";
--   DROP FUNCTION fijar_ocurrido_en_de_la_base();
--   -- y en cada tabla: volver a crear las dos foráneas (reserva_id, tenant_id) y
--   -- (archivo_id, tenant_id) tal como estaban en 20261118110000 y 20261118120000, y
--   ALTER TABLE ... DROP CONSTRAINT "<tabla>_reserva_id_archivo_id_tenant_id_fkey";
--   DROP INDEX "bookings_id_travel_file_id_tenant_id_key";
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El destino de las foráneas de tres columnas
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "bookings_id_travel_file_id_tenant_id_key"
  ON "bookings" ("id", "travel_file_id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 2. Comprobación previa: ninguna fila nombra una reserva de otro archivo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  malas integer;
  ejemplo uuid;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    SELECT count(*), min(n."id"::text)::uuid
      INTO malas, ejemplo
      FROM "notificaciones" n
     WHERE n."tenant_id" = t.id
       AND NOT EXISTS (
         SELECT 1 FROM "bookings" b
          WHERE b."id" = n."reserva_id" AND b."travel_file_id" = n."archivo_id"
            AND b."tenant_id" = n."tenant_id"
       );
    IF malas > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene % notificación(es) cuya reserva no es de su archivo (p. ej. %). Corregir a mano antes de migrar: la migración no decide cuál de las dos columnas miente.',
        t.id, malas, ejemplo;
    END IF;

    SELECT count(*), min(h."id"::text)::uuid
      INTO malas, ejemplo
      FROM "reserva_cambios_estado" h
     WHERE h."tenant_id" = t.id
       AND NOT EXISTS (
         SELECT 1 FROM "bookings" b
          WHERE b."id" = h."reserva_id" AND b."travel_file_id" = h."archivo_id"
            AND b."tenant_id" = h."tenant_id"
       );
    IF malas > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene % fila(s) en reserva_cambios_estado cuya reserva no es de su archivo (p. ej. %). Corregir a mano antes de migrar: el historial no se reescribe.',
        t.id, malas, ejemplo;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a este bloque: lo que corra después no debe ver la última agencia.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Una foránea de tres columnas en lugar de las dos separadas
-- -----------------------------------------------------------------------------
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_reserva_id_archivo_id_tenant_id_fkey"
  FOREIGN KEY ("reserva_id", "archivo_id", "tenant_id")
  REFERENCES "bookings" ("id", "travel_file_id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "notificaciones" VALIDATE CONSTRAINT "notificaciones_reserva_id_archivo_id_tenant_id_fkey";
ALTER TABLE "notificaciones" DROP CONSTRAINT "notificaciones_reserva_id_tenant_id_fkey";
ALTER TABLE "notificaciones" DROP CONSTRAINT "notificaciones_archivo_id_tenant_id_fkey";

ALTER TABLE "reserva_cambios_estado" ADD CONSTRAINT "reserva_cambios_estado_reserva_id_archivo_id_tenant_id_fkey"
  FOREIGN KEY ("reserva_id", "archivo_id", "tenant_id")
  REFERENCES "bookings" ("id", "travel_file_id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT NOT VALID;
ALTER TABLE "reserva_cambios_estado" VALIDATE CONSTRAINT "reserva_cambios_estado_reserva_id_archivo_id_tenant_id_fkey";
ALTER TABLE "reserva_cambios_estado" DROP CONSTRAINT "reserva_cambios_estado_reserva_id_tenant_id_fkey";
ALTER TABLE "reserva_cambios_estado" DROP CONSTRAINT "reserva_cambios_estado_archivo_id_tenant_id_fkey";

-- -----------------------------------------------------------------------------
-- 4. `ocurrido_en` lo pone la base
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fijar_ocurrido_en_de_la_base()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.ocurrido_en := pg_catalog.now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fijar_ocurrido_en_de_la_base() IS
  'Disparador BEFORE INSERT de los historiales (T-257): ocurrido_en es el instante de la transacción, no lo que diga el INSERT.';

REVOKE ALL ON FUNCTION fijar_ocurrido_en_de_la_base() FROM PUBLIC;

CREATE TRIGGER "reserva_cambios_estado_ocurrido_en_de_la_base"
  BEFORE INSERT ON "reserva_cambios_estado"
  FOR EACH ROW EXECUTE FUNCTION fijar_ocurrido_en_de_la_base();

COMMENT ON COLUMN "reserva_cambios_estado"."ocurrido_en" IS
  'Instante del cambio, UTC: el de la transacción que hace el UPDATE de la reserva. Lo fija el disparador reserva_cambios_estado_ocurrido_en_de_la_base; el valor del INSERT se ignora.';

-- -----------------------------------------------------------------------------
-- 5. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_tabla text;
  v_rol text;
  reales text[];
  esperados text[];
  foraneas text[];
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- 1. El único de tres columnas, con su nombre, válido y en ese orden.
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i JOIN pg_class x ON x.oid = i.indexrelid
     WHERE i.indrelid = 'public.bookings'::regclass
       AND x.relname = 'bookings_id_travel_file_id_tenant_id_key'
       AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indnatts = 3
       AND (SELECT array_agg(a.attname::text ORDER BY k.n)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, n)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
           = ARRAY['id', 'travel_file_id', 'tenant_id']
  ) THEN
    RAISE EXCEPTION 'Falta (o no es válido, único y de (id, travel_file_id, tenant_id)) bookings_id_travel_file_id_tenant_id_key.';
  END IF;

  FOREACH v_tabla IN ARRAY ARRAY['notificaciones', 'reserva_cambios_estado'] LOOP
    -- 3. Exactamente una foránea hacia `bookings`: la de tres columnas, validada, con
    --    (reserva_id, archivo_id, tenant_id) → (id, travel_file_id, tenant_id), NO ACTION / RESTRICT.
    SELECT array_agg(c.conname::text ORDER BY c.conname)
      INTO foraneas
      FROM pg_constraint c
     WHERE c.contype = 'f' AND c.conrelid = format('public.%I', v_tabla)::regclass
       AND c.confrelid = 'public.bookings'::regclass;
    IF foraneas IS DISTINCT FROM ARRAY[v_tabla || '_reserva_id_archivo_id_tenant_id_fkey'] THEN
      RAISE EXCEPTION 'Foráneas de % hacia bookings: % (se esperaba solo la de tres columnas).', v_tabla, foraneas;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
       WHERE c.conrelid = format('public.%I', v_tabla)::regclass
         AND c.conname = v_tabla || '_reserva_id_archivo_id_tenant_id_fkey'
         AND c.convalidated AND c.confdeltype = 'a' AND c.confupdtype = 'r'
         AND (SELECT array_agg(a.attname::text ORDER BY i)
                FROM generate_subscripts(c.conkey, 1) AS i
                JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[i])
             = ARRAY['reserva_id', 'archivo_id', 'tenant_id']
         AND (SELECT array_agg(a.attname::text ORDER BY i)
                FROM generate_subscripts(c.confkey, 1) AS i
                JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = c.confkey[i])
             = ARRAY['id', 'travel_file_id', 'tenant_id']
    ) THEN
      RAISE EXCEPTION '%_reserva_id_archivo_id_tenant_id_fkey no tiene las columnas, la validación o las acciones esperadas.', v_tabla;
    END IF;

    -- La foránea separada al archivo ya no existe: la de tres columnas la cubre.
    IF EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.contype = 'f' AND c.conrelid = format('public.%I', v_tabla)::regclass
                  AND c.confrelid = 'public.travel_files'::regclass) THEN
      RAISE EXCEPTION '% conserva una foránea directa a travel_files.', v_tabla;
    END IF;

    -- Toda foránea validada; y toda foránea hacia otra tabla con tenant_id empareja el tenant en la
    -- misma posición.
    IF EXISTS (SELECT 1 FROM pg_constraint c
                WHERE c.contype = 'f' AND c.conrelid = format('public.%I', v_tabla)::regclass
                  AND NOT c.convalidated) THEN
      RAISE EXCEPTION '% tiene foráneas sin validar.', v_tabla;
    END IF;
    SELECT string_agg(DISTINCT c.conname, ', ')
      INTO defectos
      FROM pg_constraint c
      JOIN pg_attribute ta ON ta.attrelid = c.conrelid AND ta.attname = 'tenant_id'
                          AND ta.attnum > 0 AND NOT ta.attisdropped
      JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attname = 'tenant_id'
                          AND pa.attnum > 0 AND NOT pa.attisdropped
     WHERE c.contype = 'f'
       AND c.conrelid = format('public.%I', v_tabla)::regclass
       AND NOT EXISTS (
         SELECT 1 FROM generate_subscripts(c.conkey, 1) AS i
          WHERE c.conkey[i] = ta.attnum AND c.confkey[i] = pa.attnum
       );
    IF defectos IS NOT NULL THEN
      RAISE EXCEPTION 'Foráneas de % que no incluyen tenant_id: %', v_tabla, defectos;
    END IF;

    -- Las tres columnas siguen siendo NOT NULL (la semántica no cambia).
    IF EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = format('public.%I', v_tabla)::regclass
                  AND a.attname IN ('reserva_id', 'archivo_id', 'tenant_id')
                  AND NOT a.attnotnull) THEN
      RAISE EXCEPTION '%: reserva_id, archivo_id y tenant_id deben ser NOT NULL.', v_tabla;
    END IF;
  END LOOP;

  -- 4. El disparador: BEFORE INSERT, por fila, habilitado, con la función esperada.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.reserva_cambios_estado'::regclass
       AND t.tgname = 'reserva_cambios_estado_ocurrido_en_de_la_base'
       AND NOT t.tgisinternal AND t.tgenabled = 'O'
       AND t.tgfoid = 'public.fijar_ocurrido_en_de_la_base()'::regprocedure
       AND pg_get_triggerdef(t.oid) ~ 'BEFORE INSERT ON (public\.)?reserva_cambios_estado FOR EACH ROW'
  ) THEN
    RAISE EXCEPTION 'Falta (o no es BEFORE INSERT por fila y habilitado) reserva_cambios_estado_ocurrido_en_de_la_base.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.fijar_ocurrido_en_de_la_base()'::regprocedure
       AND (p.prosecdef OR NOT (COALESCE(p.proconfig, '{}') && ARRAY['search_path=""', 'search_path=']))
  ) THEN
    RAISE EXCEPTION 'fijar_ocurrido_en_de_la_base debe ser SECURITY INVOKER con search_path vacío.';
  END IF;
  IF has_function_privilege('public', 'public.fijar_ocurrido_en_de_la_base()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar fijar_ocurrido_en_de_la_base.';
  END IF;

  -- La inmutabilidad no cambió: `viajapro_app` SELECT e INSERT; los demás, nada; nadie UPDATE.
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
    IF has_any_column_privilege(v_rol, 'public.reserva_cambios_estado', 'UPDATE') THEN
      RAISE EXCEPTION '% puede actualizar columnas de reserva_cambios_estado.', v_rol;
    END IF;
  END LOOP;
END;
$$;
