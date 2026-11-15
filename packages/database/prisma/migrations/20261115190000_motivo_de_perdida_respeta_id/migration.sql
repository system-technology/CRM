-- =============================================================================
-- T-229 / T-230 — el disparador del motivo de pérdida respeta el id escrito a mano
--
-- 20261115150000 dejó un disparador que recalcula `oportunidades.motivo_perdida_id` desde el enum
-- `motivo_perdida` en CADA escritura, también cuando el llamador escribe el id. Un motivo propio de
-- la agencia (clave NULL) no tiene valor de enum propio, así que la oportunidad acababa apuntando a
-- «Otro»: la API tuvo que rechazar los motivos propios (409 MOTIVO_PROPIO_SIN_SOPORTE_TODAVIA).
--
-- Regla nueva del disparador (BEFORE INSERT OR UPDATE OF motivo_perdida, motivo_perdida_id,
-- nota_perdida):
--   a. Si llega un `motivo_perdida_id` NO NULO nuevo (INSERT con id; UPDATE que lo cambia), MANDA
--      el id: debe ser un motivo de la MISMA agencia (si no, foreign_key_violation; la foránea
--      compuesta lo pararía igual) y el enum se DERIVA de él: su `clave` si es un valor del enum,
--      `OTRO` si es propio (clave NULL). Así la pareja enum/id nunca se contradice.
--   b. Si no, y cambia el enum (o la pareja quedaría coja), el comportamiento de siempre: el id se
--      resuelve desde el enum, creando el motivo canónico si la agencia no lo tiene. Es el camino de
--      los clientes antiguos, que solo escriben el enum.
--   c. Si no cambia ninguno de los dos (p. ej. solo la nota, o el mismo enum otra vez), el id se
--      queda como está: reescribir `OTRO` sobre una oportunidad con motivo propio no la mueve a
--      «Otro».
--   Y en los tres: si el motivo resultante tiene `exige_nota`, `nota_perdida` no puede ir vacía.
--
-- **Por qué cae el CHECK `oportunidades_motivo_otro_exige_nota`.** Exigía nota a todo `OTRO`. Con
-- (a), un motivo propio se guarda con enum `OTRO`, y ese CHECK le exigiría nota aunque la agencia
-- no la pida. La regla pasa a ser el DATO `motivos_de_perdida.exige_nota` (el `OTRO` sembrado y el
-- que crea el disparador lo llevan en true: para los clientes antiguos no cambia nada), y la
-- comprueba el disparador, que ahora también se dispara con `nota_perdida`. La otra mitad del
-- CHECK (nota ⇒ hay motivo) es de la fila y sigue como CHECK propio. El CHECK de pareja
-- (`oportunidades_motivo_perdida_pareja`) y la foránea compuesta no cambian.
--
-- **ON CONFLICT (T-230).** La creación del motivo canónico pasa de `ON CONFLICT DO NOTHING` (que
-- tragaba también una colisión de ETIQUETA y la convertía en un error genérico) a
-- `ON CONFLICT (tenant_id, clave) DO NOTHING`: solo la carrera esperada se absorbe; una etiqueta
-- repetida falla con su unique_violation y su nombre de índice.
--
-- **SECURITY INVOKER y `search_path = ''`**, como la función original: corre bajo la RLS de quien
-- escribe, y el motivo de otra agencia no existe para él.
--
-- **Sin datos personales (R10).** **Segura en caliente:** reemplazo de función, recreación de un
-- disparador y un CHECK que entra NOT VALID y se valida aparte; `oportunidades` tiene decenas de
-- filas. Ninguna fila cambia.
--
-- **Compatibilidad con la versión anterior de la API:** solo escribe el enum (camino b) y siempre
-- manda nota con `OTRO` (lo exige su contrato), así que no nota la diferencia.
--
-- **REVERSIBLE** con una migración posterior: volver a crear la función y el disparador de
-- 20261115150000 §5 tal cual, y
--   ALTER TABLE "oportunidades" DROP CONSTRAINT "oportunidades_nota_perdida_exige_motivo",
--     ADD CONSTRAINT "oportunidades_motivo_otro_exige_nota" CHECK (...)   -- el de 20261010210000
-- Antes de revertir, las oportunidades con motivo propio (enum OTRO) sin nota necesitan una nota,
-- o el CHECK restaurado no valida.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. La función
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
    SELECT m.clave, m.exige_nota INTO v_clave, v_exige_nota
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

      SELECT m.id, m.exige_nota INTO v_id, v_exige_nota
        FROM public.motivos_de_perdida m
       WHERE m.tenant_id = NEW.tenant_id AND m.clave = v_clave;

      IF v_id IS NULL THEN
        -- Agencia sin siembra (creada a mano o por una prueba): el motivo canónico, creado aquí.
        v_exige_nota := v_clave = 'OTRO';
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
          SELECT m.id, m.exige_nota INTO v_id, v_exige_nota
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
    -- (c) Nada cambia en el motivo: el id se queda; solo hace falta saber si exige nota.
    SELECT m.exige_nota INTO v_exige_nota
      FROM public.motivos_de_perdida m
     WHERE m.id = NEW.motivo_perdida_id AND m.tenant_id = NEW.tenant_id;
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
  'T-214/T-229: mantiene la pareja oportunidades.motivo_perdida / motivo_perdida_id. Un id escrito manda (enum = su clave, u OTRO si es propio); si solo cambia el enum, el id se resuelve desde él. Aplica motivos_de_perdida.exige_nota. SECURITY INVOKER (bajo RLS).';

-- -----------------------------------------------------------------------------
-- 2. El disparador, ahora también con la nota (la regla de exige_nota la mira)
-- -----------------------------------------------------------------------------
DROP TRIGGER "oportunidades_motivo_de_perdida_desde_enum" ON "oportunidades";
CREATE TRIGGER "oportunidades_motivo_de_perdida_desde_enum"
  BEFORE INSERT OR UPDATE OF "motivo_perdida", "motivo_perdida_id", "nota_perdida" ON "oportunidades"
  FOR EACH ROW EXECUTE FUNCTION public.motivo_de_perdida_desde_enum();

-- -----------------------------------------------------------------------------
-- 3. «OTRO exige nota» deja de ser CHECK (lo es exige_nota); «nota ⇒ motivo» se queda
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_nota_perdida_exige_motivo"
  CHECK ("nota_perdida" IS NULL OR "motivo_perdida" IS NOT NULL)
  NOT VALID;
ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_nota_perdida_exige_motivo";
ALTER TABLE "oportunidades" DROP CONSTRAINT "oportunidades_motivo_otro_exige_nota";

-- -----------------------------------------------------------------------------
-- 4. Cinturón
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  columnas text[];
BEGIN
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.motivo_de_perdida_desde_enum()'::regprocedure) THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum no puede ser SECURITY DEFINER: correría sin RLS de agencia.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS c(ajuste)
                  WHERE p.oid = 'public.motivo_de_perdida_desde_enum()'::regprocedure
                    AND c.ajuste IN ('search_path=""', 'search_path=')) THEN
    RAISE EXCEPTION 'motivo_de_perdida_desde_enum perdió su search_path vacío.';
  END IF;

  SELECT array_agg(a.attname::text ORDER BY a.attname) INTO columnas
    FROM pg_trigger t
    JOIN pg_attribute a ON a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr::int2[])
   WHERE t.tgrelid = 'public.oportunidades'::regclass
     AND t.tgname = 'oportunidades_motivo_de_perdida_desde_enum'
     AND NOT t.tgisinternal;
  IF columnas IS DISTINCT FROM ARRAY['motivo_perdida', 'motivo_perdida_id', 'nota_perdida'] THEN
    RAISE EXCEPTION 'El disparador del motivo de pérdida no vigila las columnas esperadas: %', columnas;
  END IF;

  IF (SELECT count(*) FROM pg_constraint
       WHERE convalidated
         AND conrelid = 'public.oportunidades'::regclass
         AND conname IN ('oportunidades_motivo_perdida_id_tenant_id_fkey',
                         'oportunidades_motivo_perdida_pareja',
                         'oportunidades_nota_perdida_exige_motivo')) <> 3 THEN
    RAISE EXCEPTION 'Falta (o no está validada) la foránea, la pareja o «nota ⇒ motivo».';
  END IF;
END;
$$;
