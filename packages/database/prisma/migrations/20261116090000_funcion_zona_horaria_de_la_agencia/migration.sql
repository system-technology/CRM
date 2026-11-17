-- =============================================================================
-- Ajustes de la agencia — la zona horaria se cambia por una función, no con un GRANT
--
-- Rehace sobre main el PR #234 (rama a/T-000-funcion-zona-horaria, migración 20261104170000 que
-- nunca se integró), endurecido al patrón de `viajapro_metricas` (20261115140000, ADR-0026) y de
-- sus cinturones (20261115200000 y 20261115210000).
--
-- `PATCH /api/v1/agencia/ajustes` necesita escribir `tenants.zona_horaria`. `tenants` es una tabla
-- GLOBAL, exceptuada de RLS (`excepciones_rls`), y `viajapro_app` la tiene declarada `{SELECT}`:
-- «la API solo lee». Un `GRANT UPDATE (zona_horaria)` a `viajapro_app` dejaría que un bug de
-- `WHERE` en la aplicación reescribiera la fila de OTRA agencia sin que la base lo impidiera: en
-- una tabla sin RLS el `WHERE` es la única frontera. No se hace.
--
-- Qué hace, en orden:
--   1. Rol nuevo `viajapro_ajustes`, NOLOGIN NOBYPASSRLS: no es una credencial, solo es dueño de
--      la función (mismo patrón que `viajapro_accesos`, ADR-0011, y `viajapro_metricas`,
--      ADR-0026). Ningún rol de login de aplicación es miembro suyo; el de migraciones se lo PONE
--      (SET TRUE) para crear la función y no hereda nada (INHERIT FALSE).
--   2. Su superficie, por COLUMNAS y no por tabla: `SELECT (id)` y
--      `UPDATE (zona_horaria, actualizado_en)` sobre `tenants`. Nada más: ni el nombre, ni el
--      slug, ni el estado de la agencia, ni una tabla de negocio. (El PR #234 daba SELECT de
--      TABLA; aquí la función no usa RETURNING y no lo necesita.)
--   3. `public.actualizar_zona_horaria_de_la_agencia(zona text) RETURNS text`, SECURITY DEFINER,
--      `search_path` vacío y todo cualificado, creada bajo `SET ROLE viajapro_ajustes` (dueño
--      correcto desde el principio; REVOKE/GRANT los ejecuta su dueño). La agencia sale de
--      `app.current_tenant`, NUNCA de un parámetro, y el UPDATE es `WHERE id = <ese uuid>`: una
--      fila, la propia. La firma no tiene por dónde nombrar otra agencia.
--   4. EXECUTE solo para `viajapro_app`. PUBLIC, `viajapro_altas`, `viajapro_webhook` y
--      `viajapro_identidad`, nada. La declaración de `tenants` para `viajapro_app` SIGUE siendo
--      `{SELECT}`: esta migración no toca `excepciones_rls`.
--   5. Cinturón: lo dicho, comprobado contra el catálogo.
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
-- alcanza la fila de B, porque la aplicación no elige la fila.
--
-- Es la DECIMOCUARTA función SECURITY DEFINER (la decimotercera es `medir_cola_de_salida`).
-- Toda modificación del cuerpo vuelve a pasar por auditoría de seguridad.
--
-- **Sin datos personales (R10).** **Segura en caliente:** un rol, una función y GRANT de
-- columna; ningún dato cambia y no hay bloqueo sobre `tenants` más allá del de los GRANT.
--
-- **REVERSIBLE** con una migración posterior (la API tiene que dejar de llamarla antes):
--   DROP FUNCTION public.actualizar_zona_horaria_de_la_agencia(text);
--   REVOKE ALL ON TABLE public.tenants FROM viajapro_ajustes;   -- también los de columna
--   REVOKE viajapro_ajustes FROM <rol de migraciones>;  -- y DROP ROLE viajapro_ajustes, que es
--                                                        -- global al clúster: solo si ninguna
--                                                        -- otra base lo usa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol propietario. Mismo bloque, mismos atributos que `viajapro_metricas` (20261115140000)
--    y que los propietarios de `policies/002`.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_ajustes') THEN
    CREATE ROLE viajapro_ajustes NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  BEGIN
    COMMENT ON ROLE viajapro_ajustes IS
      'Propietario de actualizar_zona_horaria_de_la_agencia. NOLOGIN: no es una credencial. Solo lee tenants.id y actualiza tenants.zona_horaria y tenants.actualizado_en.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegio para comentar el rol viajapro_ajustes.';
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
     AND pg_has_role('viajapro_ajustes', 'neon_superuser', 'MEMBER') THEN
    REVOKE neon_superuser FROM viajapro_ajustes;
  END IF;

  GRANT USAGE ON SCHEMA public TO viajapro_ajustes;

  -- El rol de migraciones puede PONÉRSELO (para crear la función como su dueño), sin heredar.
  EXECUTE format('GRANT viajapro_ajustes TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Su superficie: columnas, no tablas
--
-- `id` porque el `WHERE id = ...` lo lee. `zona_horaria` y `actualizado_en` porque el `SET` las
-- escribe. Sin RETURNING, así que no hace falta leer `zona_horaria`.
-- -----------------------------------------------------------------------------
GRANT SELECT ("id") ON TABLE public.tenants TO viajapro_ajustes;
GRANT UPDATE ("zona_horaria", "actualizado_en") ON TABLE public.tenants TO viajapro_ajustes;

-- -----------------------------------------------------------------------------
-- 3. La función, creada por su dueño
--
-- Las reglas de las funciones SECURITY DEFINER (ADR-0008 §1.4 y 20261007120300 §7): search_path
-- vacío y todo cualificado, sin SQL dinámico, volatilidad declarada (VOLATILE: escribe), y el
-- REVOKE a PUBLIC inmediatamente después de crearla. No es STRICT a propósito: con STRICT una
-- zona NULL devolvería NULL sin error y sin escribir, y la API respondería 200 a un cambio que no
-- ocurrió.
--
-- Lógica de tres valores, explícita: `current_setting(..., true)` devuelve NULL si el GUC no
-- existe y '' si se fijó vacío, y `NULL ~ patrón` es NULL, que en un IF cuenta como falso. Por
-- eso cada comprobación está escrita para que el NULL caiga del lado del error (`IS NULL OR`,
-- `COALESCE(..., false)`), nunca del lado del éxito.
-- -----------------------------------------------------------------------------
-- Poseer un objeto nuevo exige CREATE sobre el esquema. Se presta y se retira (cinturón).
GRANT CREATE ON SCHEMA public TO viajapro_ajustes;

SET ROLE viajapro_ajustes;

CREATE FUNCTION public.actualizar_zona_horaria_de_la_agencia(zona text)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_contexto text := pg_catalog.current_setting('app.current_tenant', true);
  v_agencia  uuid;
  v_filas    bigint;
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

  -- Una fila, la del contexto. El `WHERE` no admite otra: no hay parámetro de agencia.
  UPDATE public.tenants
     SET zona_horaria   = zona,
         actualizado_en = pg_catalog.now()
   WHERE id = v_agencia;
  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas = 0 THEN
    RAISE EXCEPTION 'agencia_inexistente: no hay agencia con el id del contexto'
      USING ERRCODE = 'P0002';
  END IF;
  -- `id` es la clave primaria: más de una fila es imposible. Si alguna vez no lo fuera, se aborta
  -- antes de confirmar.
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'agencia_ambigua: el id del contexto alcanzó % filas', v_filas
      USING ERRCODE = 'P0003';
  END IF;

  RETURN zona;
END;
$func$;

REVOKE ALL ON FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) TO viajapro_app;
COMMENT ON FUNCTION public.actualizar_zona_horaria_de_la_agencia(text) IS
  'Cambia la zona horaria de LA agencia del contexto (app.current_tenant), nunca de otra. Errores: 22023 zona_horaria_invalida, 42501 agencia_sin_contexto, P0002 agencia_inexistente. Decimocuarta función SECURITY DEFINER; EXECUTE solo para viajapro_app.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_ajustes;

-- -----------------------------------------------------------------------------
-- 4. Cinturón: lo que esta migración dice haber hecho, comprobado
--
-- Las mismas aserciones están en `tests/aislamiento.spec.ts` («Ajustes de la agencia»).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  f record;
  v_rol text;
  v_privilegio text;
  superficie text[];
  esperada constant text[] := ARRAY[
    'public.tenants.actualizado_en:UPDATE',
    'public.tenants.id:SELECT',
    'public.tenants.zona_horaria:UPDATE'
  ];
  propias text[];
  concedidas text[];
  miembro_de text[];
BEGIN
  -- El propietario no es credencial ni se salta RLS.
  SELECT rolcanlogin, rolbypassrls, rolsuper INTO r FROM pg_roles WHERE rolname = 'viajapro_ajustes';
  IF r.rolcanlogin OR r.rolbypassrls OR r.rolsuper THEN
    RAISE EXCEPTION 'viajapro_ajustes puede iniciar sesión o saltarse RLS: un propietario no es una credencial.';
  END IF;
  IF has_schema_privilege('viajapro_ajustes', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'viajapro_ajustes conserva CREATE sobre public.';
  END IF;

  -- Superficie EXACTA de columnas (privilegios efectivos, incluidos los de tabla, que no le
  -- vienen de PUBLIC), en todo esquema que no sea del sistema. Mismo idioma que 20261115200000.
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
     AND has_column_privilege('viajapro_ajustes', c.oid, a.attnum, p.priv)
     AND NOT has_column_privilege('public', c.oid, a.attnum, p.priv);
  IF superficie IS DISTINCT FROM esperada THEN
    RAISE EXCEPTION 'La superficie de viajapro_ajustes no es la esperada: %', superficie;
  END IF;

  -- Ni un privilegio de TABLA (daría también las columnas que se añadan mañana).
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x
              WHERE x.grantee = 'viajapro_ajustes'::regrole) THEN
    RAISE EXCEPTION 'viajapro_ajustes tiene un privilegio de tabla: su superficie son columnas.';
  END IF;

  -- No es miembro de ningún rol (no hereda ni puede cambiar a otro).
  SELECT array_agg(m.roleid::regrole::text ORDER BY 1) INTO miembro_de
    FROM pg_auth_members m WHERE m.member = 'viajapro_ajustes'::regrole;
  IF miembro_de IS NOT NULL THEN
    RAISE EXCEPTION 'viajapro_ajustes es miembro de: %', miembro_de;
  END IF;

  -- Ningún rol de login de aplicación puede actuar como el dueño (el de migraciones no está en
  -- la vista y no hereda).
  IF EXISTS (SELECT 1 FROM roles_de_login_vigilados v
              WHERE pg_has_role(v.rolname, 'viajapro_ajustes', 'MEMBER')) THEN
    RAISE EXCEPTION 'Un rol de login de aplicación puede actuar como viajapro_ajustes.';
  END IF;

  -- Dueño EXACTAMENTE de esta función, en cualquier esquema, y nadie le concede EXECUTE sobre
  -- otra (fuera de la entrada implícita del dueño en el ACL de la suya). Idioma de 20261115210000.
  SELECT array_agg(format('%s.%s', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO propias
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proowner = 'viajapro_ajustes'::regrole;
  IF propias IS DISTINCT FROM ARRAY['public.actualizar_zona_horaria_de_la_agencia'] THEN
    RAISE EXCEPTION 'viajapro_ajustes debe ser dueño solo de public.actualizar_zona_horaria_de_la_agencia; lo es de: %', propias;
  END IF;
  SELECT array_agg(p.oid::regprocedure::text ORDER BY 1)
    INTO concedidas
    FROM pg_proc p, aclexplode(p.proacl) x
   WHERE x.grantee = 'viajapro_ajustes'::regrole
     AND p.proowner <> x.grantee;
  IF concedidas IS NOT NULL THEN
    RAISE EXCEPTION 'Funciones que conceden EXECUTE a viajapro_ajustes: %', concedidas;
  END IF;

  -- La función: una sola firma, SECURITY DEFINER, search_path VACÍO (el valor, no la presencia)
  -- y la firma del contrato.
  SELECT p.oid, p.prosecdef, p.proconfig,
         pg_get_function_identity_arguments(p.oid) AS argumentos,
         pg_get_function_result(p.oid) AS resultado
    INTO f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'actualizar_zona_horaria_de_la_agencia';
  IF NOT f.prosecdef THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia no es SECURITY DEFINER.';
  END IF;
  IF f.proconfig IS NULL
     OR NOT (f.proconfig && ARRAY['search_path=""', 'search_path=']) THEN
    RAISE EXCEPTION 'actualizar_zona_horaria_de_la_agencia no tiene search_path vacío: %', f.proconfig;
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
      RAISE EXCEPTION '% puede ejecutar actualizar_zona_horaria_de_la_agencia: solo la API.', v_rol;
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
