-- =============================================================================
-- T-307 — perfiles_de_agencia: `creado_en` y `actualizado_en` los fija el disparador
--
-- La auditoría de seguridad de T-261 dejó un hallazgo menor: `viajapro_app` podía escribir
-- `creado_en` y `actualizado_en` a su antojo (`INSERT ... creado_en = '2000-01-01'`). Es cosmético
-- mientras nadie dependa de ellos, pero sirve de auditoría —«cuándo declaró la agencia este RNT»—
-- solo si la aplicación no puede falsearlo.
--
-- Qué hace: REEMPLAZA `proteger_verificacion_del_perfil` (la versión vigente es la de T-268,
-- 20261120140000) conservando TODA su lógica de verificación y añadiendo, solo para quien NO es la
-- plataforma (el dueño de la tabla):
--   - INSERT: `creado_en` y `actualizado_en` quedan en `now()`.
--   - UPDATE: `creado_en` conserva el valor anterior y `actualizado_en` queda en `now()`.
-- La plataforma sigue pudiendo fijarlos (una migración o un traspaso de datos los necesita). Así se
-- trata a `verificado_en`: lo que el cliente manda se ignora, no se rechaza, para que el upsert de
-- la API (`SET actualizado_en = now()`) siga funcionando sin cambios.
--
-- Nada cambia para quien ya usa la tabla: ni columnas, ni privilegios, ni el trigger (el mismo
-- `perfiles_de_agencia_proteger_verificacion`, que apunta a la función por nombre). Una fila
-- existente conserva sus fechas.
--
-- REVERSIBLE con una migración nueva: volver a `CREATE OR REPLACE FUNCTION` con el cuerpo de
-- 20261120140000, sin pérdida de datos.
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
      NEW.creado_en := pg_catalog.now();
      NEW.actualizado_en := pg_catalog.now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_dato_cambiado := NEW.rnt IS DISTINCT FROM OLD.rnt
                  OR NEW.nit IS DISTINCT FROM OLD.nit
                  OR NEW.digito_verificacion IS DISTINCT FROM OLD.digito_verificacion;

  IF NOT v_plataforma THEN
    NEW.creado_en := OLD.creado_en;
    NEW.actualizado_en := pg_catalog.now();
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
  'Disparador BEFORE INSERT OR UPDATE de perfiles_de_agencia (T-261, T-268, T-307): solo la plataforma (el dueno de la tabla) fija o conserva un verificado_en no nulo y escribe creado_en y actualizado_en; cambiar el rnt, el nit o el digito_verificacion anula la verificacion. SECURITY INVOKER, search_path vacio.';

-- CREATE OR REPLACE conserva el ACL, pero se repite: el cinturón lo comprueba.
REVOKE ALL ON FUNCTION proteger_verificacion_del_perfil() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Cinturón: la función sigue siendo SECURITY INVOKER con search_path vacío, sin EXECUTE para
-- PUBLIC, el disparador sigue habilitado, y la nueva lógica está en el catálogo.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
     WHERE p.oid = 'public.proteger_verificacion_del_perfil()'::regprocedure
       AND (p.prosecdef OR NOT (COALESCE(p.proconfig, '{}') && ARRAY['search_path=""', 'search_path=']))
  ) THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil debe ser SECURITY INVOKER con search_path vacío.';
  END IF;
  IF has_function_privilege('public', 'public.proteger_verificacion_del_perfil()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar proteger_verificacion_del_perfil.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfiles_de_agencia'::regclass
       AND NOT t.tgisinternal
       AND t.tgenabled = 'O'
       AND t.tgfoid = 'public.proteger_verificacion_del_perfil()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'perfiles_de_agencia no tiene habilitado el disparador proteger_verificacion_del_perfil.';
  END IF;
  IF pg_get_functiondef('public.proteger_verificacion_del_perfil()'::regprocedure)
       !~ 'NEW\.creado_en := OLD\.creado_en' THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil no fija creado_en en el UPDATE.';
  END IF;
END;
$$;
