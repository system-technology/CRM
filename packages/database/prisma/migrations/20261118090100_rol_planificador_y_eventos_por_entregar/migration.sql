-- =============================================================================
-- T-241, ADR-0024 F2 (parte de base de datos del despachador) — `viajapro_planificador` y
-- `tenants_con_eventos_por_entregar`
--
-- ADR-0024 §1 y §5.3. El despachador de eventos de dominio corre en el proceso de la API con
-- `viajapro_app` y entrega agencia por agencia (`ejecutarCon` + `conTenant`). Para saber QUÉ
-- agencias tienen eventos pendientes sin recorrerlas a ciegas y sin vía de plataforma, necesita
-- mirar `outbox` y `entregas_de_eventos` de todas, que tienen RLS FORZADA. Eso exige una función
-- SECURITY DEFINER; es la DECIMOQUINTA, abre una lectura entre agencias y su forma es la frontera:
--
--   · `public.tenants_con_eventos_por_entregar(p_consumidor text, p_tipo_evento text)
--     RETURNS SETOF uuid`: SOLO ids de agencia. Ni ids de evento, ni payload, ni conteos.
--   · Agencias `ACTIVO` o `EN_PRUEBA` con alguna fila de `outbox` de ese `tipo_evento` ocurrida en
--     los últimos 7 días que NO tenga, para ese consumidor, una entrega hecha (`entregado_en`) ni
--     abandonada (`abandonado_en`). Una entrega con intentos fallidos y sin marca sigue pendiente.
--   · Valida el formato de los dos argumentos (el del CHECK `entregas_de_eventos_consumidor_formato`
--     y su longitud) y lanza 22023 si no casan. Sin SQL dinámico. `LIMIT 500` agencias por
--     llamada, en orden de id.
--   · EXECUTE solo para `viajapro_app`. Ni PUBLIC, ni `viajapro_webhook` (el trabajador no corre el
--     despachador: ADR-0024 §1, «En qué proceso vive»), ni `viajapro_altas`, ni
--     `viajapro_identidad`.
--
-- **Cómo ve entre agencias SIN saltarse RLS** (patrón de `medir_cola_de_salida`, ADR-0026). El
-- dueño es un rol nuevo, `viajapro_planificador`, NOLOGIN NOBYPASSRLS NOINHERIT. La función recorre
-- `tenants` y, para cada uno, fija `app.current_tenant` con `set_config(..., true)` y consulta: las
-- políticas canónicas de `outbox` y `entregas_de_eventos` no se tocan, y en cada consulta el dueño
-- ve exactamente UNA agencia. Al terminar devuelve `app.current_tenant` al valor del llamador; si
-- falla, el error aborta la transacción (o el punto de guardado) y el GUC se deshace con ella.
-- No se usa `SET app.current_tenant` en la cabecera (PG ≥ 15 lo rechaza a un rol no superusuario).
--
-- **Superficie del dueño, por COLUMNAS** (ADR-0024 §5.3, lo que ESTA función usa):
--   `tenants (id, estado)`, `outbox (id, tenant_id, tipo_evento, ocurrido_en)`,
--   `entregas_de_eventos (tenant_id, outbox_id, consumidor, entregado_en, abandonado_en)`.
-- Ni `outbox.payload`, ni `entregas_de_eventos.ultimo_error`, ni escritura alguna. Las columnas
-- de `bookings` que §5.3 también le asigna son de `reservas_con_plazo_por_avisar`, que es de F5:
-- se conceden en la migración de F5, junto con la función que las usa. Hasta entonces, un SELECT
-- que nadie usa sería superficie gratuita.
--
-- **Por qué no `viajapro_metricas`.** Su salida es agregada (dos enteros); la de esta es por fila
-- (ids de agencia). ADR-0024 §5.3 y ADR-0026 «Cuándo revisar».
--
-- Ningún rol de login de aplicación es miembro suyo; el de migraciones se lo PONE (SET TRUE) para
-- crear la función y no hereda nada (INHERIT FALSE). `CREATE` sobre `public` se presta y se
-- retira en esta misma migración. Las cuatro reglas de 20261007120300 §7: search_path vacío y todo
-- cualificado, sin SQL dinámico, volatilidad declarada (VOLATILE: llama a `set_config`), y el
-- REVOKE a PUBLIC inmediatamente después de crearla, por su dueño.
--
-- **Qué protege y qué no.** Como RLS, la función confía en que quien la llama es `viajapro_app`;
-- lo que devuelve son ids de agencia, que no son secretos dentro del sistema y que el despachador
-- solo usa para abrir una transacción de ESA agencia, donde RLS vuelve a mandar. La lista es una
-- pista, no una autoridad (ADR-0024 §3.6, punto 2).
--
-- Toda modificación del cuerpo vuelve a pasar por `auditor-seguridad` (ADR-0024 §5.3).
--
-- **Coste.** Una consulta por agencia activa sobre `outbox_tenant_id_tipo_evento_id_idx` (F1),
-- con un anti-join por la clave primaria de `entregas_de_eventos`. Con cientos de agencias,
-- milisegundos. Sin EXPLAIN ANALYZE a volumen aquí: no hay Postgres en este entorno.
--
-- **Sin datos personales (R10).** **Segura en caliente:** un rol, una función y GRANT de columna;
-- ningún dato cambia y no hay bloqueo sobre las tablas más allá del de los GRANT.
--
-- **REVERSIBLE** con una migración posterior (el despachador tiene que dejar de llamarla antes;
-- sin ella, barre solo por la pista en memoria):
--   DROP FUNCTION public.tenants_con_eventos_por_entregar(text, text);
--   REVOKE ALL ON TABLE public.tenants, public.outbox, public.entregas_de_eventos
--     FROM viajapro_planificador;   -- también los de columna
--   REVOKE viajapro_planificador FROM <rol de migraciones>;  -- y DROP ROLE, que es global al
--                                                             -- clúster: solo si ninguna otra
--                                                             -- base lo usa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol propietario. Mismo bloque, mismos atributos que `viajapro_metricas` y
--    `viajapro_ajustes`.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_planificador') THEN
    CREATE ROLE viajapro_planificador NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  BEGIN
    COMMENT ON ROLE viajapro_planificador IS
      'Propietario de tenants_con_eventos_por_entregar (ADR-0024 §5.3). NOLOGIN: no es una credencial. Solo lee columnas de tenants, outbox y entregas_de_eventos; devuelve ids de agencia.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegio para comentar el rol viajapro_planificador.';
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
     AND pg_has_role('viajapro_planificador', 'neon_superuser', 'MEMBER') THEN
    REVOKE neon_superuser FROM viajapro_planificador;
  END IF;

  GRANT USAGE ON SCHEMA public TO viajapro_planificador;

  -- El rol de migraciones puede PONÉRSELO (para crear la función como su dueño), sin heredar.
  EXECUTE format('GRANT viajapro_planificador TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Su superficie: columnas, no tablas
--
-- `tenant_id` de `outbox` y de `entregas_de_eventos` también porque la política canónica y el
-- anti-join lo leen.
-- -----------------------------------------------------------------------------
GRANT SELECT ("id", "estado") ON TABLE public.tenants TO viajapro_planificador;
GRANT SELECT ("id", "tenant_id", "tipo_evento", "ocurrido_en") ON TABLE public.outbox TO viajapro_planificador;
GRANT SELECT ("tenant_id", "outbox_id", "consumidor", "entregado_en", "abandonado_en")
  ON TABLE public.entregas_de_eventos TO viajapro_planificador;

-- -----------------------------------------------------------------------------
-- 3. La función, creada por su dueño
--
-- No es STRICT a propósito: con STRICT un argumento NULL devolvería cero filas sin error, y un
-- despachador mal cableado creería que no hay nada pendiente. Aquí NULL cae del lado del error.
-- -----------------------------------------------------------------------------
-- Poseer un objeto nuevo exige CREATE sobre el esquema. Se presta y se retira (cinturón).
GRANT CREATE ON SCHEMA public TO viajapro_planificador;

SET ROLE viajapro_planificador;

CREATE FUNCTION public.tenants_con_eventos_por_entregar(p_consumidor text, p_tipo_evento text)
RETURNS SETOF uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_previo   text := pg_catalog.current_setting('app.current_tenant', true);
  v_desde    timestamptz := pg_catalog.now() - interval '7 days';
  v_tenant   uuid;
  v_devueltos integer := 0;
BEGIN
  -- Los argumentos: el formato del CHECK de `entregas_de_eventos.consumidor` y su longitud
  -- (varchar(80) y varchar(120)). `COALESCE(..., false)`: un NULL cae del lado del error.
  IF NOT COALESCE(p_consumidor ~ '^[a-z]+\.[a-z_]+$' AND pg_catalog.length(p_consumidor) <= 80, false) THEN
    RAISE EXCEPTION 'consumidor_invalido: el consumidor no tiene la forma contexto.nombre'
      USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_tipo_evento ~ '^[a-z]+\.[a-z_]+$' AND pg_catalog.length(p_tipo_evento) <= 120, false) THEN
    RAISE EXCEPTION 'tipo_evento_invalido: el tipo de evento no tiene la forma contexto.nombre'
      USING ERRCODE = '22023';
  END IF;

  FOR v_tenant IN
    SELECT t.id FROM public.tenants t
     WHERE t.estado IN ('ACTIVO'::public.estado_tenant, 'EN_PRUEBA'::public.estado_tenant)
     ORDER BY t.id
  LOOP
    -- Local a la transacción; se devuelve el valor del llamador al terminar.
    PERFORM pg_catalog.set_config('app.current_tenant', v_tenant::text, true);

    IF EXISTS (
      SELECT 1
        FROM public.outbox o
       WHERE o.tenant_id = v_tenant
         AND o.tipo_evento = p_tipo_evento
         AND o.ocurrido_en >= v_desde
         AND NOT EXISTS (
           SELECT 1
             FROM public.entregas_de_eventos e
            WHERE e.tenant_id = o.tenant_id
              AND e.outbox_id = o.id
              AND e.consumidor = p_consumidor
              AND (e.entregado_en IS NOT NULL OR e.abandonado_en IS NOT NULL))
    ) THEN
      RETURN NEXT v_tenant;
      v_devueltos := v_devueltos + 1;
      EXIT WHEN v_devueltos >= 500;
    END IF;
  END LOOP;

  PERFORM pg_catalog.set_config('app.current_tenant', COALESCE(v_previo, ''), true);
  RETURN;
END;
$func$;

REVOKE ALL ON FUNCTION public.tenants_con_eventos_por_entregar(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tenants_con_eventos_por_entregar(text, text) TO viajapro_app;
COMMENT ON FUNCTION public.tenants_con_eventos_por_entregar(text, text) IS
  'ADR-0024 §1/§5.3: ids de las agencias ACTIVO/EN_PRUEBA con algún evento de outbox de ese tipo (últimos 7 días) sin entrega hecha ni abandonada para ese consumidor. Solo ids, LIMIT 500. Recorre tenants fijando app.current_tenant (RLS intacta). Errores: 22023 consumidor_invalido / tipo_evento_invalido. Decimoquinta función SECURITY DEFINER; EXECUTE solo para viajapro_app.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_planificador;

-- -----------------------------------------------------------------------------
-- 4. Cinturón: lo que esta migración dice haber hecho, comprobado
--
-- Las mismas aserciones están en `tests/aislamiento.spec.ts` («T-241 — ADR-0024 F2»).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  f record;
  v_rol text;
  superficie text[];
  esperada constant text[] := ARRAY[
    'public.entregas_de_eventos.abandonado_en:SELECT',
    'public.entregas_de_eventos.consumidor:SELECT',
    'public.entregas_de_eventos.entregado_en:SELECT',
    'public.entregas_de_eventos.outbox_id:SELECT',
    'public.entregas_de_eventos.tenant_id:SELECT',
    'public.outbox.id:SELECT',
    'public.outbox.ocurrido_en:SELECT',
    'public.outbox.tenant_id:SELECT',
    'public.outbox.tipo_evento:SELECT',
    'public.tenants.estado:SELECT',
    'public.tenants.id:SELECT'
  ];
  propias text[];
  concedidas text[];
  miembro_de text[];
BEGIN
  -- El propietario no es credencial, no se salta RLS y no hereda.
  SELECT rolcanlogin, rolbypassrls, rolsuper, rolinherit INTO r
    FROM pg_roles WHERE rolname = 'viajapro_planificador';
  IF r.rolcanlogin OR r.rolbypassrls OR r.rolsuper OR r.rolinherit THEN
    RAISE EXCEPTION 'viajapro_planificador puede iniciar sesión, saltarse RLS o heredar: un propietario no es una credencial.';
  END IF;
  IF has_schema_privilege('viajapro_planificador', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'viajapro_planificador conserva CREATE sobre public.';
  END IF;

  -- Superficie EXACTA de columnas (privilegios efectivos, que no le vienen de PUBLIC), en todo
  -- esquema que no sea del sistema. Mismo idioma que 20261115200000 y 20261116090000.
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
     AND has_column_privilege('viajapro_planificador', c.oid, a.attnum, p.priv)
     AND NOT has_column_privilege('public', c.oid, a.attnum, p.priv);
  IF superficie IS DISTINCT FROM esperada THEN
    RAISE EXCEPTION 'La superficie de viajapro_planificador no es la esperada: %', superficie;
  END IF;

  -- Ni un privilegio de TABLA (daría también las columnas que se añadan mañana, como el payload).
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x
              WHERE x.grantee = 'viajapro_planificador'::regrole) THEN
    RAISE EXCEPTION 'viajapro_planificador tiene un privilegio de tabla: su superficie son columnas.';
  END IF;
  IF has_column_privilege('viajapro_planificador', 'public.outbox', 'payload', 'SELECT')
     OR has_column_privilege('viajapro_planificador', 'public.entregas_de_eventos', 'ultimo_error', 'SELECT') THEN
    RAISE EXCEPTION 'viajapro_planificador puede leer outbox.payload o entregas_de_eventos.ultimo_error.';
  END IF;

  -- No es miembro de ningún rol (no hereda ni puede cambiar a otro).
  SELECT array_agg(m.roleid::regrole::text ORDER BY m.roleid::regrole::text) INTO miembro_de
    FROM pg_auth_members m WHERE m.member = 'viajapro_planificador'::regrole;
  IF miembro_de IS NOT NULL THEN
    RAISE EXCEPTION 'viajapro_planificador es miembro de: %', miembro_de;
  END IF;

  -- Ningún rol de login de aplicación puede actuar como el dueño (el de migraciones no está en
  -- la vista y no hereda).
  IF EXISTS (SELECT 1 FROM roles_de_login_vigilados v
              WHERE pg_has_role(v.rolname, 'viajapro_planificador', 'MEMBER')) THEN
    RAISE EXCEPTION 'Un rol de login de aplicación puede actuar como viajapro_planificador.';
  END IF;

  -- Dueño EXACTAMENTE de esta función, en cualquier esquema, y nadie le concede EXECUTE sobre
  -- otra (fuera de la entrada implícita del dueño en el ACL de la suya). Idioma de 20261115210000.
  SELECT array_agg(format('%s.%s', n.nspname, p.proname) ORDER BY n.nspname, p.proname)
    INTO propias
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proowner = 'viajapro_planificador'::regrole;
  IF propias IS DISTINCT FROM ARRAY['public.tenants_con_eventos_por_entregar'] THEN
    RAISE EXCEPTION 'viajapro_planificador debe ser dueño solo de public.tenants_con_eventos_por_entregar; lo es de: %', propias;
  END IF;
  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO concedidas
    FROM pg_proc p, aclexplode(p.proacl) x
   WHERE x.grantee = 'viajapro_planificador'::regrole
     AND p.proowner <> x.grantee;
  IF concedidas IS NOT NULL THEN
    RAISE EXCEPTION 'Funciones que conceden EXECUTE a viajapro_planificador: %', concedidas;
  END IF;

  -- La función: una sola firma, SECURITY DEFINER, search_path VACÍO (el valor, no la presencia),
  -- VOLATILE y la firma del contrato: SOLO uuid.
  SELECT p.oid, p.prosecdef, p.proconfig, p.provolatile,
         pg_get_function_identity_arguments(p.oid) AS argumentos,
         pg_get_function_result(p.oid) AS resultado
    INTO f
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'tenants_con_eventos_por_entregar';
  IF NOT f.prosecdef THEN
    RAISE EXCEPTION 'tenants_con_eventos_por_entregar no es SECURITY DEFINER.';
  END IF;
  IF f.proconfig IS NULL
     OR NOT (f.proconfig && ARRAY['search_path=""', 'search_path=']) THEN
    RAISE EXCEPTION 'tenants_con_eventos_por_entregar no tiene search_path vacío: %', f.proconfig;
  END IF;
  IF f.provolatile <> 'v' THEN
    RAISE EXCEPTION 'tenants_con_eventos_por_entregar no es VOLATILE.';
  END IF;
  IF f.argumentos IS DISTINCT FROM 'p_consumidor text, p_tipo_evento text'
     OR f.resultado IS DISTINCT FROM 'SETOF uuid' THEN
    RAISE EXCEPTION 'tenants_con_eventos_por_entregar no tiene la firma del contrato: (%) -> %',
      f.argumentos, f.resultado;
  END IF;

  -- EXECUTE: PUBLIC no; `viajapro_app` sí; el resto de roles de login, no.
  IF has_function_privilege('public', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar tenants_con_eventos_por_entregar.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app')
     AND NOT has_function_privilege('viajapro_app', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'viajapro_app no puede ejecutar tenants_con_eventos_por_entregar.';
  END IF;
  FOREACH v_rol IN ARRAY ARRAY['viajapro_altas', 'viajapro_webhook', 'viajapro_identidad'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol);
    IF has_function_privilege(v_rol, f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar tenants_con_eventos_por_entregar: solo la API.', v_rol;
    END IF;
  END LOOP;
END;
$$;
