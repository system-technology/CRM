-- =============================================================================
-- Ajustes de la agencia — la zona horaria se cambia por una función, no con un GRANT
--
-- `PATCH /api/v1/agencia/ajustes` necesita escribir `tenants.zona_horaria`. `tenants` es una tabla
-- GLOBAL, exceptuada de RLS (`excepciones_rls`), y `viajapro_app` la tiene declarada `{SELECT}`:
-- «la API solo lee». Un `GRANT UPDATE (zona_horaria)` a `viajapro_app` dejaría que un bug de
-- `WHERE` en la aplicación reescribiera la fila de OTRA agencia sin que la base lo impidiera: en
-- una tabla sin RLS el `WHERE` es la única frontera. No se hace.
--
-- Qué hace, en orden:
--   1. Rol nuevo `viajapro_ajustes`, NOLOGIN: no es una credencial, solo es dueño de la función
--      (mismo patrón que `viajapro_accesos` con el disparador de `usuarios`, ADR-0011). Sus
--      únicos privilegios: SELECT sobre `tenants` y UPDATE de las columnas `zona_horaria` y
--      `actualizado_en`. Ningún rol de login es miembro suyo.
--   2. `public.actualizar_zona_horaria_de_la_agencia(zona text) RETURNS text`, SECURITY DEFINER,
--      `search_path` vacío y todo cualificado. La agencia sale de `app.current_tenant`, NUNCA de
--      un parámetro, y el UPDATE es `WHERE id = <ese uuid>`: una fila, la propia.
--   3. EXECUTE solo para `viajapro_app`. PUBLIC, `viajapro_altas`, `viajapro_webhook` y
--      `viajapro_identidad`, nada.
--   4. `aplicar_privilegios_declarados()` y el cinturón. La declaración de `tenants` para
--      `viajapro_app` SIGUE siendo `{SELECT}`: esta migración no toca `excepciones_rls`.
--
-- **El contrato que usa la API** (traducción de errores por SQLSTATE, no por texto):
--   SELECT public.actualizar_zona_horaria_de_la_agencia($1) AS zona_horaria
--     · éxito → la zona guardada (text), y `actualizado_en = now()` en la fila de la agencia.
--     · 22023 invalid_parameter_value, mensaje `zona_horaria_invalida: ...` → 422. La zona es
--       NULL, no está en `pg_timezone_names`, o es un alias `posix/`, `right/`, `localtime`,
--       `posixrules` o `Factory` (los conoce el tzdata de Postgres pero no el ICU de Node: la
--       zona guardada la consume `Intl.DateTimeFormat`, y con ellos los seguimientos lanzarían
--       RangeError).
--     · 42501 insufficient_privilege, mensaje `agencia_sin_contexto: ...` → 500. El contexto de
--       tenant está vacío, no existe o no es un uuid canónico. Es un error de programación.
--     · P0002 no_data_found, mensaje `agencia_inexistente: ...` → 500 (o 404). El uuid del
--       contexto no corresponde a ninguna agencia.
--
-- **Qué protege y qué no.** Igual que RLS en las tablas de negocio, la función confía en
-- `app.current_tenant`, que fija el propio rol: no defiende de una inyección SQL que fije el
-- contexto de otra agencia (ahí RLS tampoco). Lo que cierra es el caso que el GRANT abría: con
-- el contexto de A, ningún error de la aplicación —un `WHERE` olvidado, un id equivocado—
-- alcanza la fila de B, porque la aplicación no elige la fila. Y solo dos columnas: ni el
-- nombre, ni el slug, ni el estado de la agencia son escribibles por este camino.
--
-- Segura en caliente: un rol, una función y dos GRANT. No toca ninguna tabla ni sus datos.
--
-- **REVERSIBLE** con una migración posterior (la API tiene que dejar de llamarla antes):
--   DROP FUNCTION public.actualizar_zona_horaria_de_la_agencia(text);
--   REVOKE ALL ON TABLE public.tenants FROM viajapro_ajustes;
--   REVOKE viajapro_ajustes FROM <rol de migraciones>;  -- y DROP ROLE viajapro_ajustes, que es
--                                                        -- global al clúster: solo si ninguna
--                                                        -- otra base lo usa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol propietario. Mismos atributos que los otros tres propietarios de `policies/002`.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_ajustes') THEN
    CREATE ROLE viajapro_ajustes NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  BEGIN
    COMMENT ON ROLE viajapro_ajustes IS
      'Propietario de actualizar_zona_horaria_de_la_agencia. NOLOGIN: no es una credencial. Solo actualiza tenants.zona_horaria y tenants.actualizado_en.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegio para comentar el rol viajapro_ajustes.';
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
     AND pg_has_role('viajapro_ajustes', 'neon_superuser', 'MEMBER') THEN
    REVOKE neon_superuser FROM viajapro_ajustes;
  END IF;

  GRANT USAGE ON SCHEMA public TO viajapro_ajustes;
  REVOKE CREATE ON SCHEMA public FROM viajapro_ajustes;

  -- El rol de migraciones puede PONÉRSELO para traspasarle la propiedad, y no hereda nada.
  EXECUTE format('GRANT viajapro_ajustes TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

-- Lo único que puede hacer su dueño. SELECT de tabla porque el `WHERE id` y el `RETURNING`
-- leen; UPDATE solo de las dos columnas. Ni INSERT, ni DELETE, ni el resto de columnas.
GRANT SELECT ON TABLE public.tenants TO viajapro_ajustes;
GRANT UPDATE (zona_horaria, actualizado_en) ON TABLE public.tenants TO viajapro_ajustes;

-- -----------------------------------------------------------------------------
-- 2. La función
--
-- Las reglas de las funciones SECURITY DEFINER de ADR-0008 §1.4: search_path vacío y todo
-- cualificado, sin SQL dinámico, volatilidad declarada (VOLATILE: escribe). No es STRICT a
-- propósito: con STRICT una zona NULL devolvería NULL sin error y sin escribir, y la API
-- respondería 200 a un cambio que no ocurrió.
--
-- Lógica de tres valores, explícita: `current_setting(..., true)` devuelve NULL si el GUC no
-- existe y '' si se fijó vacío, y `NULL ~ patrón` es NULL, que en un IF cuenta como falso. Por
-- eso cada comprobación está escrita para que el NULL caiga del lado del error (`IS NULL OR`,
-- `COALESCE(..., false)`), nunca del lado del éxito.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.actualizar_zona_horaria_de_la_agencia(zona text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_contexto  text := pg_catalog.current_setting('app.current_tenant', true);
  v_agencia   uuid;
  v_resultado text;
BEGIN
  -- La agencia, del contexto y solo del contexto. Uuid canónico (8-4-4-4-12): el cast de uuid
  -- acepta también llaves y la forma sin guiones, y aquí no hay razón para aceptar más formas
  -- que las que fija la aplicación.
  IF NOT COALESCE(
       v_contexto ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
       false) THEN
    RAISE EXCEPTION 'agencia_sin_contexto: app.current_tenant está vacío o no es un uuid'
      USING ERRCODE = '42501';
  END IF;
  v_agencia := v_contexto::uuid;

  -- La zona: un nombre IANA exacto (sensible a mayúsculas) del tzdata del servidor, sin los
  -- alias que Postgres conoce y el ICU de Node no.
  IF zona IS NULL
     OR zona LIKE 'posix/%'
     OR zona LIKE 'right/%'
     OR zona IN ('localtime', 'posixrules', 'Factory')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name = zona) THEN
    RAISE EXCEPTION 'zona_horaria_invalida: % no es una zona horaria IANA reconocida',
        COALESCE(pg_catalog.quote_literal(zona), 'NULL')
      USING ERRCODE = '22023',
            HINT = 'Use un nombre como America/Bogota o Europe/Madrid.';
  END IF;

  UPDATE public.tenants
     SET zona_horaria   = zona,
         actualizado_en = pg_catalog.now()
   WHERE id = v_agencia
  RETURNING zona_horaria INTO v_resultado;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'agencia_inexistente: no hay agencia con el id del contexto'
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_resultado;
END;
$func$;

-- El orden es el único que funciona (ver 20261007120300): revocar y conceder ANTES del
-- traspaso de propiedad. Después, el rol de migraciones deja de ser el concedente: su REVOKE
-- sería un no-op con AVISO y su GRANT fallaría.
REVOKE ALL ON FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) TO viajapro_app;
COMMENT ON FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) IS
  'Cambia la zona horaria de LA agencia del contexto (app.current_tenant), nunca de otra. Errores: 22023 zona_horaria_invalida, 42501 agencia_sin_contexto, P0002 agencia_inexistente. EXECUTE solo viajapro_app.';

GRANT CREATE ON SCHEMA public TO viajapro_ajustes;
ALTER FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) OWNER TO viajapro_ajustes;
REVOKE CREATE ON SCHEMA public FROM viajapro_ajustes;

-- -----------------------------------------------------------------------------
-- 3. Privilegios, por el único mecanismo que los gobierna. No toca `viajapro_ajustes` (no es
-- de login) y reafirma `{SELECT}` sobre `tenants` para los tres roles de negocio.
-- -----------------------------------------------------------------------------
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 4. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  f record;
  v_rol text;
  v_privilegio text;
BEGIN
  -- El propietario: no es credencial, no se salta RLS, y ningún rol de login es miembro suyo
  -- (salvo el de migraciones, que se lo pone con SET y no hereda).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_ajustes'
              AND (rolcanlogin OR rolsuper OR rolbypassrls)) THEN
    RAISE EXCEPTION 'viajapro_ajustes puede iniciar sesión o saltarse RLS: un propietario no es una credencial.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid = m.member
     WHERE m.roleid = 'viajapro_ajustes'::regrole
       AND r.rolcanlogin
       AND r.rolname <> current_user
  ) THEN
    RAISE EXCEPTION 'Un rol de login es miembro de viajapro_ajustes.';
  END IF;

  -- Su superficie exacta: SELECT de tabla sobre tenants, UPDATE de dos columnas, y nada más.
  IF NOT has_table_privilege('viajapro_ajustes', 'public.tenants', 'SELECT')
     OR has_table_privilege('viajapro_ajustes', 'public.tenants', 'UPDATE')
     OR has_table_privilege('viajapro_ajustes', 'public.tenants', 'INSERT')
     OR has_table_privilege('viajapro_ajustes', 'public.tenants', 'DELETE')
     OR NOT has_column_privilege('viajapro_ajustes', 'public.tenants', 'zona_horaria', 'UPDATE')
     OR NOT has_column_privilege('viajapro_ajustes', 'public.tenants', 'actualizado_en', 'UPDATE')
     OR has_column_privilege('viajapro_ajustes', 'public.tenants', 'nombre', 'UPDATE')
     OR has_column_privilege('viajapro_ajustes', 'public.tenants', 'estado', 'UPDATE')
     OR has_column_privilege('viajapro_ajustes', 'public.tenants', 'id', 'UPDATE') THEN
    RAISE EXCEPTION 'viajapro_ajustes no tiene exactamente SELECT y UPDATE(zona_horaria, actualizado_en) sobre tenants.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'tenants'
       AND has_table_privilege('viajapro_ajustes', c.oid, p)
  ) THEN
    RAISE EXCEPTION 'viajapro_ajustes tiene privilegios sobre otra tabla que tenants.';
  END IF;

  -- La función: una sola firma, SECURITY DEFINER, search_path VACÍO (el valor, no la
  -- presencia: `search_path=public` también «lo fija») y el dueño que le toca.
  SELECT p.oid, p.prosecdef, p.proconfig, pg_get_userbyid(p.proowner) AS dueno,
         pg_get_function_identity_arguments(p.oid) AS argumentos,
         pg_get_function_result(p.oid) AS resultado
    INTO f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'actualizar_zona_horaria_de_la_agencia';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia no existe.';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'actualizar_zona_horaria_de_la_agencia') <> 1 THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia está sobrecargada.';
  END IF;
  IF NOT f.prosecdef THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia no es SECURITY DEFINER.';
  END IF;
  IF f.proconfig IS NULL
     OR NOT (f.proconfig && ARRAY['search_path=""', 'search_path=']) THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia no tiene search_path vacío: %', f.proconfig;
  END IF;
  IF f.dueno IS DISTINCT FROM 'viajapro_ajustes' THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia tiene el propietario equivocado: %', f.dueno;
  END IF;
  IF f.argumentos IS DISTINCT FROM 'zona text' OR f.resultado IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia no tiene la firma del contrato: (%) -> %',
      f.argumentos, f.resultado;
  END IF;

  -- EXECUTE: PUBLIC no; `viajapro_app` sí; el resto de roles de login, no.
  IF has_function_privilege('public', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar actualizar_zona_horaria_de_la_agencia.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app')
     AND NOT has_function_privilege('viajapro_app', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'viajapro_app no puede ejecutar actualizar_zona_horaria_de_la_agencia.';
  END IF;
  FOREACH v_rol IN ARRAY ARRAY['viajapro_altas', 'viajapro_webhook', 'viajapro_identidad'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol);
    IF has_function_privilege(v_rol, f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar actualizar_zona_horaria_de_la_agencia.', v_rol;
    END IF;
  END LOOP;

  -- Y lo que NO cambia: `viajapro_app` sigue sin poder escribir `tenants` por ningún camino
  -- directo, ni de tabla ni de columna. La declaración sigue siendo `{SELECT}`.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app') THEN
    FOREACH v_privilegio IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('viajapro_app', 'public.tenants', v_privilegio) THEN
        RAISE EXCEPTION 'viajapro_app tiene % sobre tenants.', v_privilegio;
      END IF;
    END LOOP;
    IF has_any_column_privilege('viajapro_app', 'public.tenants', 'UPDATE')
       OR has_any_column_privilege('viajapro_app', 'public.tenants', 'INSERT') THEN
      RAISE EXCEPTION 'viajapro_app tiene UPDATE o INSERT de columna sobre tenants.';
    END IF;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.excepciones_rls e
     WHERE e.tabla = 'tenants' AND e.rol = 'viajapro_app' AND e.privilegios = ARRAY['SELECT']::text[]
  ) THEN
    RAISE EXCEPTION 'La declaración de tenants para viajapro_app dejó de ser {SELECT}.';
  END IF;
END;
$$;
