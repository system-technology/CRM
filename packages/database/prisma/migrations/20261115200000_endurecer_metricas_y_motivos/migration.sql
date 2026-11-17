-- =============================================================================
-- T-230 / T-232 — endurecer la medida de la cola de salida y los motivos de pérdida
--
-- Cuatro cosas, ninguna cambia filas de negocio salvo la reparación de §2 (que en una base sana
-- no toca nada):
--
--   1. `medir_cola_de_salida` (20261115140000) NO se reescribe. La auditoría de T-223 pedía
--      comprobar que un error a mitad de la función devuelve `app.current_tenant` al llamador.
--      Lo hace ya, y no por el cuerpo sino por el motor: la función fija el GUC con
--      `set_config(..., true)` (local), y PostgreSQL deshace todo cambio de GUC local al abortar
--      la transacción o el punto de guardado (subtransacción) en que ocurrió. Un bloque
--      `EXCEPTION` en el cuerpo sería redundante (abre su propia subtransacción, que el motor
--      deshace igual) y obligaría a volver a pasar por auditoría una función SECURITY DEFINER
--      sin ganar nada. Lo fija una prueba de COMPORTAMIENTO en `aislamiento.spec.ts` (T-230):
--      se le retira al dueño una columna dentro de una transacción, la función falla después de
--      su primer `set_config`, y tras `ROLLBACK TO SAVEPOINT` el llamador conserva su agencia.
--      Aquí solo queda, en el cinturón, la superficie EXACTA de privilegios de `viajapro_metricas`
--      (la misma lista que fija la prueba).
--
--   2. CHECK `motivos_de_perdida_otro_exige_nota`: el motivo de clave `OTRO` no puede quedar con
--      `exige_nota = false` (T-232). Es la regla que 20261115190000 movió del enum al dato; sin
--      esto, un PATCH desactivaba la explicación de «Otro» y el informe volvía a tener pérdidas
--      «por otro motivo» sin decir cuál. Antes del CHECK, una reparación agencia por agencia
--      (RLS forzada: sin contexto el UPDATE vería cero filas) devuelve `exige_nota = true` a todo
--      `OTRO` que un PATCH de T-229 hubiera dejado en false. Entra NOT VALID y se valida aparte.
--
--   3. `motivo_de_perdida_desde_enum` rechaza ASIGNAR un motivo con `activo = false` (T-232):
--      cuando el id de la oportunidad CAMBIA (INSERT con motivo, o UPDATE que lo mueve), venga
--      el id escrito a mano (camino a) o resuelto desde el enum (camino b). NO cuando se toca
--      otra columna de una oportunidad que ya lo tenía (camino c, o el mismo id reescrito):
--      retirar un motivo no puede romper la edición de las oportunidades que lo usaron.
--      SQLSTATE propio `VP001`, clase `VP` (definida por la implementación, que PostgreSQL no
--      usa), y mensaje que empieza por `MOTIVO_DE_PERDIDA_INACTIVO`: la API lo traduce a su
--      error tipado (409). Hoy la API lo comprueba en una transacción y escribe en otra; esto
--      cierra el SQL directo y el camino del enum, que la API no miraba. No se bloquea el motivo
--      con FOR SHARE: una desactivación que confirma en el mismo instante equivale a una que
--      llega justo después de la asignación, que también se permitiría (lo viejo lo conserva).
--
--   4. ON CONFLICT (T-230): la siembra de motivos para agencias nuevas es TS
--      (`siembra-de-tenant.ts`, upsert por (tenant_id, clave)), y el único disparador que siembra
--      es este mismo, que ya lleva `ON CONFLICT ("tenant_id", "clave") DO NOTHING` desde
--      20261115190000. Se conserva tal cual en el reemplazo y el cinturón lo comprueba.
--
-- La función se reemplaza con CREATE OR REPLACE: conserva dueño y privilegios, sigue SECURITY
-- INVOKER (bajo la RLS de quien escribe) y con `search_path = ''`. El disparador no cambia.
--
-- **Sin datos personales (R10).** **Segura en caliente:** reemplazo de función, un UPDATE de a lo
-- sumo una fila por agencia y un CHECK NOT VALID + VALIDATE (SHARE UPDATE EXCLUSIVE) sobre una
-- tabla de siete filas por agencia.
--
-- **Compatibilidad con la versión anterior de la API:** un PATCH `exigeNota = false` sobre OTRO
-- y un cierre por enum con un motivo de sistema desactivado, que antes entraban, le devuelven un
-- 500 (la versión nueva: 422 y 409). Los dos son justo lo que se quiere impedir.
--
-- **REVERSIBLE** con una migración posterior: volver a crear la función de 20261115190000 §1 tal
-- cual y `ALTER TABLE "motivos_de_perdida" DROP CONSTRAINT "motivos_de_perdida_otro_exige_nota"`.
-- La reparación de §2 no se deshace (devolvía la regla vigente hasta T-229).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 2. «OTRO exige nota», como CHECK sobre el dato
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  quedan integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    UPDATE "motivos_de_perdida"
       SET "exige_nota" = true, "actualizado_en" = now()
     WHERE "tenant_id" = t.id AND "clave" = 'OTRO' AND NOT "exige_nota";

    SELECT count(*) INTO quedan
      FROM "motivos_de_perdida"
     WHERE "tenant_id" = t.id AND "clave" = 'OTRO' AND NOT "exige_nota";
    IF quedan > 0 THEN
      RAISE EXCEPTION 'La agencia % sigue con % motivo(s) OTRO sin exige_nota.', t.id, quedan;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración (ver 20261115130000 §0).
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

ALTER TABLE "motivos_de_perdida" ADD CONSTRAINT "motivos_de_perdida_otro_exige_nota"
  CHECK ("clave" IS DISTINCT FROM 'OTRO' OR "exige_nota")
  NOT VALID;
ALTER TABLE "motivos_de_perdida" VALIDATE CONSTRAINT "motivos_de_perdida_otro_exige_nota";

-- -----------------------------------------------------------------------------
-- 3. El disparador rechaza asignar un motivo desactivado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.motivo_de_perdida_desde_enum()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $func$
DECLARE
  v_clave text;
  v_id uuid;
  v_exige_nota boolean := false;
  v_activo boolean := true;
  v_id_explicito boolean;
  v_enum_cambia boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_id_explicito := NEW.motivo_perdida_id IS NOT NULL;
    v_enum_cambia := true;
  ELSE
    v_id_explicito := NEW.motivo_perdida_id IS NOT NULL
                      AND NEW.motivo_perdida_id IS DISTINCT FROM OLD.motivo_perdida_id;
    v_enum_cambia := NEW.motivo_perdida IS DISTINCT FROM OLD.motivo_perdida;
  END IF;

  IF v_id_explicito THEN
    -- (a) Manda el id. Bajo RLS: el motivo de otra agencia no se encuentra.
    SELECT m.clave, m.exige_nota, m.activo INTO v_clave, v_exige_nota, v_activo
      FROM public.motivos_de_perdida m
     WHERE m.id = NEW.motivo_perdida_id AND m.tenant_id = NEW.tenant_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El motivo de pérdida % no existe en la agencia %.',
        NEW.motivo_perdida_id, NEW.tenant_id
        USING ERRCODE = 'foreign_key_violation';
    END IF;

    -- La clave, si es de la taxonomía común; OTRO si es propio (clave NULL: `= ANY` da NULL).
    NEW.motivo_perdida := CASE
      WHEN v_clave = ANY (pg_catalog.enum_range(NULL::public.motivo_perdida)::text[])
        THEN v_clave::public.motivo_perdida
      ELSE 'OTRO'::public.motivo_perdida
    END;

  ELSIF v_enum_cambia OR (NEW.motivo_perdida IS NULL) <> (NEW.motivo_perdida_id IS NULL) THEN
    -- (b) El camino de siempre: el id desde el enum.
    IF NEW.motivo_perdida IS NULL THEN
      NEW.motivo_perdida_id := NULL;
    ELSE
      v_clave := NEW.motivo_perdida::text;

      SELECT m.id, m.exige_nota, m.activo INTO v_id, v_exige_nota, v_activo
        FROM public.motivos_de_perdida m
       WHERE m.tenant_id = NEW.tenant_id AND m.clave = v_clave;

      IF v_id IS NULL THEN
        -- Agencia sin siembra (creada a mano o por una prueba): el motivo canónico, creado aquí.
        v_exige_nota := v_clave = 'OTRO';
        v_activo := true;
        INSERT INTO public.motivos_de_perdida
          (id, tenant_id, clave, etiqueta, orden, exige_nota, actualizado_en)
        VALUES (
          -- uuid v7: milisegundos sobre los 48 bits altos de un v4, con la versión puesta a 7.
          -- `overlay` y `substring` van sin cualificar porque son sintaxis SQL (PLACING, FROM).
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
          v_exige_nota,
          pg_catalog.now()
        )
        -- Solo la carrera esperada (otra transacción creó la misma clave). Una etiqueta repetida
        -- falla aquí, con su índice, en vez de convertirse en un error genérico más abajo.
        ON CONFLICT ("tenant_id", "clave") DO NOTHING
        RETURNING id INTO v_id;

        IF v_id IS NULL THEN
          SELECT m.id, m.exige_nota, m.activo INTO v_id, v_exige_nota, v_activo
            FROM public.motivos_de_perdida m
           WHERE m.tenant_id = NEW.tenant_id AND m.clave = v_clave;
        END IF;

        IF v_id IS NULL THEN
          RAISE EXCEPTION 'La agencia % no tiene el motivo de pérdida % y no se pudo crear.',
            NEW.tenant_id, v_clave
            USING ERRCODE = 'foreign_key_violation';
        END IF;
      END IF;

      NEW.motivo_perdida_id := v_id;
    END IF;

  ELSIF NEW.motivo_perdida_id IS NOT NULL THEN
    -- (c) Nada cambia en el motivo: el id se queda; solo hace falta saber si exige nota. Que esté
    -- desactivado da igual: la oportunidad ya lo tenía.
    SELECT m.exige_nota INTO v_exige_nota
      FROM public.motivos_de_perdida m
     WHERE m.id = NEW.motivo_perdida_id AND m.tenant_id = NEW.tenant_id;
  END IF;

  -- Asignar (el id CAMBIA) un motivo retirado no se puede; conservarlo, sí.
  IF NEW.motivo_perdida_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.motivo_perdida_id IS DISTINCT FROM OLD.motivo_perdida_id)
     AND v_activo IS FALSE THEN
    RAISE EXCEPTION 'MOTIVO_DE_PERDIDA_INACTIVO: el motivo de pérdida % está desactivado en la agencia %; elige uno activo.',
      NEW.motivo_perdida_id, NEW.tenant_id
      USING ERRCODE = 'VP001';
  END IF;

  IF NEW.motivo_perdida_id IS NOT NULL
     AND COALESCE(v_exige_nota, false)
     AND pg_catalog.btrim(COALESCE(NEW.nota_perdida, '')) = '' THEN
    RAISE EXCEPTION 'El motivo de pérdida % exige explicación en nota_perdida (motivos_de_perdida.exige_nota).',
      NEW.motivo_perdida_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$func$;

REVOKE ALL ON FUNCTION public.motivo_de_perdida_desde_enum() FROM PUBLIC;
COMMENT ON FUNCTION public.motivo_de_perdida_desde_enum() IS
  'T-214/T-229/T-232: mantiene la pareja oportunidades.motivo_perdida / motivo_perdida_id. Un id escrito manda (enum = su clave, u OTRO si es propio); si solo cambia el enum, el id se resuelve desde él. Aplica motivos_de_perdida.exige_nota y rechaza (SQLSTATE VP001) asignar un motivo con activo = false. SECURITY INVOKER (bajo RLS).';

-- -----------------------------------------------------------------------------
-- 4. Cinturón
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  superficie text[];
  esperada constant text[] := ARRAY[
    'public.mensajes.creado_en:SELECT',
    'public.mensajes.estado:SELECT',
    'public.mensajes.tenant_id:SELECT',
    'public.mensajes.wamid:SELECT',
    'public.tenants.id:SELECT'
  ];
  definicion text;
  columnas text[];
BEGIN
  -- (T-230) La superficie EXACTA del dueño de medir_cola_de_salida: privilegios efectivos de
  -- columna (incluyen los de tabla) que no le vienen de PUBLIC, en todo esquema que no sea del
  -- sistema. Una columna o una tabla de más, y la migración no entra.
  SELECT array_agg(format('%s.%s.%s:%s', n.nspname, c.relname, a.attname, p.priv)
                   ORDER BY n.nspname, c.relname, a.attname, p.priv)
    INTO superficie
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS p(priv)
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND n.nspname NOT LIKE 'pg\_toast%'
     AND n.nspname NOT LIKE 'pg\_temp%'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND has_column_privilege('viajapro_metricas', c.oid, a.attnum, p.priv)
     AND NOT has_column_privilege('public', c.oid, a.attnum, p.priv);
  IF superficie IS DISTINCT FROM esperada THEN
    RAISE EXCEPTION 'La superficie de viajapro_metricas no es la esperada: %', superficie;
  END IF;

  -- (T-230) El reemplazo de 20261115190000 no pierde el ON CONFLICT acotado a (tenant_id, clave).
  definicion := pg_get_functiondef('public.motivo_de_perdida_desde_enum()'::regprocedure);
  IF position('ON CONFLICT ("tenant_id", "clave") DO NOTHING' IN definicion) = 0 THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum perdió su ON CONFLICT ("tenant_id", "clave").';
  END IF;
  IF position('VP001' IN definicion) = 0 THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum no rechaza asignar un motivo desactivado.';
  END IF;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.motivo_de_perdida_desde_enum()'::regprocedure) THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum no puede ser SECURITY DEFINER: correría sin RLS de agencia.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS c(ajuste)
                  WHERE p.oid = 'public.motivo_de_perdida_desde_enum()'::regprocedure
                    AND c.ajuste IN ('search_path=""', 'search_path=')) THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum perdió su search_path vacío.';
  END IF;
  IF has_function_privilege('public', 'public.motivo_de_perdida_desde_enum()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar motivo_de_perdida_desde_enum.';
  END IF;

  -- El disparador sigue vigilando las mismas tres columnas.
  SELECT array_agg(a.attname::text ORDER BY a.attname) INTO columnas
    FROM pg_trigger t
    JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr::int2[])
   WHERE t.tgrelid = 'public.oportunidades'::regclass
     AND t.tgname = 'oportunidades_motivo_de_perdida_desde_enum'
     AND NOT t.tgisinternal;
  IF columnas IS DISTINCT FROM ARRAY['motivo_perdida', 'motivo_perdida_id', 'nota_perdida'] THEN
    RAISE EXCEPTION 'El disparador del motivo de pérdida no vigila las columnas esperadas: %', columnas;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.motivos_de_perdida'::regclass
                    AND conname = 'motivos_de_perdida_otro_exige_nota'
                    AND contype = 'c' AND convalidated) THEN
    RAISE EXCEPTION 'Falta (o no está validado) motivos_de_perdida_otro_exige_nota.';
  END IF;
END;
$$;
