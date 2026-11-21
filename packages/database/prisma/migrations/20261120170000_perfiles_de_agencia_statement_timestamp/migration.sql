-- =============================================================================
-- T-375 y T-376 — perfiles_de_agencia: `statement_timestamp()` en las fechas de auditoría, y un
-- cinturón que mira el cuerpo entero del disparador
--
-- La auditoría de seguridad de T-307 dejó dos hallazgos de riesgo bajo sobre la migración
-- 20261120160000, que ya está aplicada y por eso NO se edita: se corrige con esta.
--
-- T-375. `pg_catalog.now()` es la hora de INICIO DE LA TRANSACCIÓN. `viajapro_app` puede abrir una
-- transacción, esperar y escribir: `creado_en` y `actualizado_en` quedan antedatados por lo que haya
-- durado la espera. El disparador pasa a `pg_catalog.statement_timestamp()`, la hora en que llegó la
-- sentencia que escribe la fila. Dentro del disparador es la misma sentencia, así que un upsert sigue
-- dando una sola hora para `creado_en` y `actualizado_en`. No es `clock_timestamp()` a propósito:
-- dentro de una sentencia larga cambiaría entre filas.
--
-- Queda un margen que no se cierra aquí y que no hace falta cerrar: quien controla el momento en que
-- manda cada sentencia controla su `statement_timestamp()`. Lo que ya no puede es escribir una hora
-- anterior a la de su propia sentencia ni dejar que la de una transacción vieja valga para una fila
-- nueva.
--
-- T-376. El cinturón de 20261120160000 solo miraba una línea del UPDATE, y aceptaba una función con
-- ajustes de más (`proconfig`). Este comprueba el cuerpo entero —cada una de las cuatro asignaciones
-- de fecha, su número exacto y que no quede ningún `now()`— y exige que `proconfig` sea exactamente
-- `search_path` vacío, sin otros ajustes.
--
-- La lógica de verificación (rnt, nit, digito_verificacion) NO cambia: es la de T-268 y T-307.
-- Nada cambia en columnas, privilegios ni en el disparador, que apunta a la función por nombre. Las
-- filas existentes conservan sus fechas.
--
-- REVERSIBLE con una migración nueva, sin pérdida de datos: `CREATE OR REPLACE FUNCTION` con el
-- cuerpo de 20261120160000.
-- =============================================================================

CREATE OR REPLACE FUNCTION proteger_verificacion_del_perfil()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_plataforma boolean;
  v_dato_cambiado boolean;
BEGIN
  -- La plataforma es el dueño de la tabla (o un superusuario): ningún rol de aplicación lo es.
  v_plataforma := pg_catalog.pg_has_role(
    current_user,
    (SELECT c.relowner FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID),
    'USAGE'
  );

  IF TG_OP = 'INSERT' THEN
    IF NOT v_plataforma THEN
      NEW.verificado_en := NULL;
      NEW.creado_en := pg_catalog.statement_timestamp();
      NEW.actualizado_en := pg_catalog.statement_timestamp();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_dato_cambiado := NEW.rnt IS DISTINCT FROM OLD.rnt
                  OR NEW.nit IS DISTINCT FROM OLD.nit
                  OR NEW.digito_verificacion IS DISTINCT FROM OLD.digito_verificacion;

  IF NOT v_plataforma THEN
    NEW.creado_en := OLD.creado_en;
    NEW.actualizado_en := pg_catalog.statement_timestamp();
    IF v_dato_cambiado THEN
      NEW.verificado_en := NULL;
    ELSE
      NEW.verificado_en := OLD.verificado_en;
    END IF;
  ELSIF v_dato_cambiado
        AND NEW.verificado_en IS NOT DISTINCT FROM OLD.verificado_en THEN
    NEW.verificado_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION proteger_verificacion_del_perfil() IS
  'Disparador BEFORE INSERT OR UPDATE de perfiles_de_agencia (T-261, T-268, T-307, T-375): solo la plataforma (el dueno de la tabla) fija o conserva un verificado_en no nulo y escribe creado_en y actualizado_en; fuera de ella, esas dos fechas son la hora de la sentencia (statement_timestamp). Cambiar el rnt, el nit o el digito_verificacion anula la verificacion. SECURITY INVOKER, search_path vacio.';

-- CREATE OR REPLACE conserva el ACL, pero se repite: el cinturón lo comprueba.
REVOKE ALL ON FUNCTION proteger_verificacion_del_perfil() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Cinturón: el cuerpo entero de la función, y su superficie, contra el catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_fuente text;
BEGIN
  SELECT p.prosrc INTO v_fuente
    FROM pg_proc p
   WHERE p.oid = 'public.proteger_verificacion_del_perfil()'::regprocedure;

  -- SECURITY INVOKER y `proconfig` EXACTAMENTE `search_path` vacío: ni un ajuste de más.
  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.proteger_verificacion_del_perfil()'::regprocedure
       AND (p.prosecdef
            OR p.proconfig IS NULL
            OR NOT (p.proconfig = ARRAY['search_path=""'] OR p.proconfig = ARRAY['search_path=']))
  ) THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil debe ser SECURITY INVOKER y su proconfig exactamente search_path vacío.';
  END IF;
  IF has_function_privilege('public', 'public.proteger_verificacion_del_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar proteger_verificacion_del_perfil.';
  END IF;

  -- El disparador sigue habilitado y apuntando a esta función.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfiles_de_agencia'::regclass
       AND NOT t.tgisinternal
       AND t.tgenabled = 'O'
       AND t.tgfoid = 'public.proteger_verificacion_del_perfil()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'perfiles_de_agencia no tiene habilitado el disparador proteger_verificacion_del_perfil.';
  END IF;

  -- Las cuatro asignaciones de fecha, cada una el número exacto de veces: creado_en y actualizado_en
  -- con la hora de la sentencia en el INSERT, actualizado_en con la hora de la sentencia en el UPDATE
  -- (dos veces en total) y creado_en conservado en el UPDATE.
  IF pg_catalog.regexp_count(v_fuente, 'NEW\.creado_en := pg_catalog\.statement_timestamp\(\);') <> 1 THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil: creado_en debe fijarse una vez, con statement_timestamp, en el INSERT.';
  END IF;
  IF pg_catalog.regexp_count(v_fuente, 'NEW\.actualizado_en := pg_catalog\.statement_timestamp\(\);') <> 2 THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil: actualizado_en debe fijarse dos veces (INSERT y UPDATE) con statement_timestamp.';
  END IF;
  IF pg_catalog.regexp_count(v_fuente, 'NEW\.creado_en := OLD\.creado_en;') <> 1 THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil: el UPDATE debe conservar creado_en.';
  END IF;
  -- Ningún now() ni clock_timestamp(): la hora de la transacción es justo lo que T-375 retira, y la de
  -- reloj cambiaría entre filas de una misma sentencia.
  IF v_fuente ~* '(^|[^a-z_])(now|clock_timestamp|transaction_timestamp|current_timestamp)([^a-z_]|$)' THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil no debe usar now(), clock_timestamp() ni la hora de la transacción.';
  END IF;
END;
$$;
