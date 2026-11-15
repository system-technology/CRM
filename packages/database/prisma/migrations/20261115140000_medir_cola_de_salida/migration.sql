-- =============================================================================
-- T-223 — antigüedad de la cola de SALIDA (envíos pendientes), medida entre agencias
--
-- T-203 midió la cola de ENTRADA con `listar_changes_pendientes`, que lee el staging global. Los
-- envíos salientes pendientes viven en `mensajes`, que tiene `tenant_id` y RLS FORZADA: el
-- trabajador (`viajapro_webhook`) solo ve la agencia de su `app.current_tenant`, y ningún rol del
-- sistema se salta RLS (R2, aserción 14). Medir «el envío pendiente más viejo de TODO el sistema»
-- exige una función SECURITY DEFINER. Es la DECIMOTERCERA y abre una lectura entre agencias, así
-- que su forma es la frontera y se fija aquí:
--
--   · Devuelve UNA fila con DOS enteros: `mas_vieja_s` (segundos del pendiente más viejo, 0 si no
--     hay) y `pendientes` (cuántos). Ni ids de mensaje ni de tenant, ni texto, ni por agencia.
--   · «Pendiente» es `estado = 'PENDIENTE' AND wamid IS NULL`: lo que todavía no aceptó Meta. Es
--     el predicado de `idx_mensajes_envios_pendientes` (20261104140000), que lo resuelve. Incluye
--     los reservados sin wamid: son justo los atascados que hay que ver.
--   · Sin argumentos: no hay nada que validar ni que abusar.
--   · EXECUTE solo para `viajapro_webhook` (el trabajador, que publica la medida en Redis para
--     `/salud/listo`). La API no: lee la medida de Redis, como la de entrada.
--
-- **Cómo ve entre agencias SIN saltarse RLS.** El dueño es un rol nuevo, `viajapro_metricas`,
-- NOLOGIN y NOBYPASSRLS como los otros tres propietarios. La función recorre `tenants` y, para
-- cada uno, fija `app.current_tenant` y cuenta: la política canónica de `mensajes` no se toca, no
-- hay política adicional ni excepción, y en cada consulta el dueño ve exactamente UNA agencia. Al
-- terminar, la función devuelve `app.current_tenant` al valor que traía el llamador: un llamador
-- dentro de una transacción de agencia no sale con el contexto de otra. Si la función falla, el
-- error aborta la transacción (o el punto de guardado del llamador), y el cambio de GUC se
-- deshace con ella. NO se usa `SET app.current_tenant = ...` en la cabecera: con un rol sin
-- superusuario, PostgreSQL ≥ 15 rechaza fijar un parámetro de marcador de posición en
-- `proconfig` («permission denied to set parameter»).
--
-- **Superficie del dueño, por columnas.** `viajapro_metricas` recibe SELECT solo sobre las
-- columnas que la consulta usa: `mensajes (tenant_id, estado, wamid, creado_en)` y
-- `tenants (id)`. No puede leer `texto_cifrado` ni nada más aunque alguien cambie el cuerpo.
-- Ningún rol de login es miembro suyo; el rol de migraciones se lo PONE (SET) para crear la
-- función y no hereda nada (INHERIT FALSE), igual que con `viajapro_accesos`.
--
-- Las cuatro reglas de 20261007120300 §7: search_path vacío y todo cualificado, sin SQL dinámico,
-- volatilidad declarada (VOLATILE: llama a `set_config`), y el REVOKE a PUBLIC inmediatamente
-- después de crearla. Se crea bajo `SET ROLE viajapro_metricas`, de modo que el dueño es el
-- correcto desde el principio y el REVOKE/GRANT lo ejecuta su dueño.
--
-- Coste: una consulta por agencia sobre un índice parcial que en régimen normal está casi vacío,
-- cada 30 s (`INTERVALO_DE_MEDICION_S`). Con cientos de agencias, milisegundos.
--
-- Toda modificación del cuerpo vuelve a pasar por auditoría de seguridad.
--
-- REVERSIBLE, sin datos: `DROP FUNCTION public.medir_cola_de_salida()`, `REVOKE` de las columnas
-- y `DROP ROLE viajapro_metricas`. El trabajador tolera su ausencia (publica `sin_verificar`).
-- En caliente: solo catálogo; ningún bloqueo sobre `mensajes` más allá del de los GRANT.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El rol propietario. Mismo bloque, mismos atributos que en `policies/002` y 20261019230000.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_metricas') THEN
    CREATE ROLE viajapro_metricas NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  BEGIN
    COMMENT ON ROLE viajapro_metricas IS
      'Propietario de medir_cola_de_salida (T-223). NOLOGIN: no es una credencial. Solo lee columnas de recuento de mensajes y el id de tenants.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegio para comentar el rol viajapro_metricas.';
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
     AND pg_has_role('viajapro_metricas', 'neon_superuser', 'MEMBER') THEN
    REVOKE neon_superuser FROM viajapro_metricas;
  END IF;

  GRANT USAGE ON SCHEMA public TO viajapro_metricas;

  -- El rol de migraciones puede PONÉRSELO (para crear la función como su dueño), sin heredar.
  EXECUTE format('GRANT viajapro_metricas TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Su superficie: columnas, no tablas
-- -----------------------------------------------------------------------------
GRANT SELECT ("id") ON TABLE public.tenants TO viajapro_metricas;
GRANT SELECT ("tenant_id", "estado", "wamid", "creado_en") ON TABLE public.mensajes TO viajapro_metricas;

-- -----------------------------------------------------------------------------
-- 3. La función, creada por su dueño
-- -----------------------------------------------------------------------------
-- Poseer un objeto nuevo exige CREATE sobre el esquema. Se presta y se retira (cinturón).
GRANT CREATE ON SCHEMA public TO viajapro_metricas;

SET ROLE viajapro_metricas;

CREATE FUNCTION public.medir_cola_de_salida()
RETURNS TABLE (
  mas_vieja_s integer,
  pendientes integer
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_previo text := pg_catalog.current_setting('app.current_tenant', true);
  v_tenant uuid;
  v_vieja timestamptz;
  v_cuantos bigint;
  v_mas_vieja timestamptz;
  v_total bigint := 0;
BEGIN
  FOR v_tenant IN SELECT t.id FROM public.tenants t LOOP
    -- Local a la transacción; se devuelve el valor del llamador al terminar.
    PERFORM pg_catalog.set_config('app.current_tenant', v_tenant::text, true);

    SELECT pg_catalog.min(m.creado_en), pg_catalog.count(*)
      INTO v_vieja, v_cuantos
      FROM public.mensajes m
     WHERE m.tenant_id = v_tenant
       AND m.estado = 'PENDIENTE'
       AND m.wamid IS NULL;

    v_total := v_total + v_cuantos;
    IF v_vieja IS NOT NULL AND (v_mas_vieja IS NULL OR v_vieja < v_mas_vieja) THEN
      v_mas_vieja := v_vieja;
    END IF;
  END LOOP;

  PERFORM pg_catalog.set_config('app.current_tenant', COALESCE(v_previo, ''), true);

  RETURN QUERY
  SELECT COALESCE(
           pg_catalog.floor(pg_catalog.date_part('epoch', pg_catalog.now() - v_mas_vieja))::integer,
           0),
         LEAST(v_total, 2147483647)::integer;
END;
$func$;

REVOKE ALL ON FUNCTION public.medir_cola_de_salida() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.medir_cola_de_salida() TO viajapro_webhook;
COMMENT ON FUNCTION public.medir_cola_de_salida() IS
  'T-223: antigüedad en segundos del envío saliente pendiente (sin wamid) más viejo y cuántos hay, sumando todas las agencias. Solo dos enteros: ni ids, ni tenant, ni texto. Recorre tenants fijando app.current_tenant (RLS intacta). Decimotercera función SECURITY DEFINER; EXECUTE solo para viajapro_webhook.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_metricas;

-- -----------------------------------------------------------------------------
-- 4. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  rol text;
BEGIN
  SELECT rolcanlogin, rolbypassrls, rolsuper INTO r FROM pg_roles WHERE rolname = 'viajapro_metricas';
  IF r.rolcanlogin OR r.rolbypassrls OR r.rolsuper THEN
    RAISE EXCEPTION 'viajapro_metricas puede iniciar sesión o saltarse RLS.';
  END IF;

  IF has_schema_privilege('viajapro_metricas', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'viajapro_metricas conserva CREATE sobre public.';
  END IF;

  -- Ni un privilegio de TABLA: solo columnas. `has_table_privilege` no cuenta los de columna.
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) p
     WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
       AND has_table_privilege('viajapro_metricas', c.oid, p)
  ) THEN
    RAISE EXCEPTION 'viajapro_metricas tiene un privilegio de tabla: su superficie son columnas.';
  END IF;
  IF has_column_privilege('viajapro_metricas', 'public.mensajes', 'texto_cifrado', 'SELECT') THEN
    RAISE EXCEPTION 'viajapro_metricas puede leer mensajes.texto_cifrado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'medir_cola_de_salida'
       AND p.prosecdef
       AND pg_get_userbyid(p.proowner) = 'viajapro_metricas'
       AND 'search_path=""' = ANY (p.proconfig)
  ) THEN
    RAISE EXCEPTION 'medir_cola_de_salida no es SECURITY DEFINER, no es de viajapro_metricas o no fija search_path vacío.';
  END IF;

  IF has_function_privilege('public', 'public.medir_cola_de_salida()', 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar medir_cola_de_salida.';
  END IF;
  FOREACH rol IN ARRAY ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_identidad'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol);
    IF has_function_privilege(rol, 'public.medir_cola_de_salida()', 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar medir_cola_de_salida: solo el trabajador.', rol;
    END IF;
  END LOOP;

  -- Ningún rol de login puede actuar como el dueño (salvo el de migraciones, que no hereda).
  IF EXISTS (
    SELECT 1 FROM roles_de_login_vigilados v
     WHERE pg_has_role(v.rolname, 'viajapro_metricas', 'MEMBER')
  ) THEN
    RAISE EXCEPTION 'Un rol de login de aplicación puede actuar como viajapro_metricas.';
  END IF;
END;
$$;
