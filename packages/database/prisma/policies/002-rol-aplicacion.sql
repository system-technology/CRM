-- =============================================================================
-- Roles de conexión y propietarios — R2, ADR-0003 y ADR-0008 §1.3
--
-- La aplicación NUNCA se conecta con el rol propietario ni con uno que pueda saltarse RLS.
-- Si lo hiciera, todas las políticas de aislamiento serían decorativas y nadie se enteraría:
-- las consultas devolverían datos, no habría error, y la fuga entre agencias sería total.
--
-- En PostgreSQL gestionado (Neon) esto importa el doble: el rol que el proveedor crea por
-- defecto es miembro de `neon_superuser`, que tiene BYPASSRLS. Ver ADR-0007.
--
-- ADR-0008 convierte el rol de conexión en la frontera de seguridad real, y por eso aquí
-- hay cinco roles y no uno:
--
--   · Los tres de login tienen privilegios IDÉNTICOS sobre las tablas de negocio y se
--     diferencian ÚNICAMENTE en qué funciones pueden ejecutar. Esa es toda la idea:
--     **el rol de conexión es lo único que una inyección SQL no puede falsear.** La
--     comprobación de tenant dentro de una función `SECURITY DEFINER` no sirve de
--     frontera, porque `app.current_tenant` lo fija el propio rol con `set_config`.
--   · Los dos propietarios son NOLOGIN y **no son credenciales: son propietarios**. No
--     tienen contraseña y nunca la tendrán. Con NOLOGIN, "comprometer viajapro_enrutador"
--     no existe como escenario: para actuar como él hay que ser ya dueño del esquema o
--     superusuario, y ahí el aislamiento está perdido con o sin ADR-0008.
--
-- SIN CONTRASEÑAS. Este archivo no las fija, a propósito: un archivo del repositorio no
-- es sitio para un secreto, y las meta-órdenes de psql (`\set`) impedían reaplicarlo
-- desde la prueba de la aserción 22, que es la que detecta la reconcesión. Las
-- contraseñas de los tres roles de login las genera, una sola vez y sin guardarlas,
-- `scripts/crear-rol-aplicacion.mjs`. Un rol LOGIN sin contraseña no puede conectarse:
-- el estado por defecto es el seguro.
--
-- Idempotente: se puede volver a ejecutar sin romper nada. Y se vuelve a ejecutar: la
-- aserción 22 lo hace en cada corrida de pruebas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Los cinco roles
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rol record;
BEGIN
  FOR rol IN
    SELECT * FROM (VALUES
      ('viajapro_app',        true,  'API: todo el resto de la aplicación. Ejecuta registrar_recepcion y nada más del directorio.'),
      ('viajapro_altas',      true,  'SOLO el caso de uso de Embedded Signup. Único rol con EXECUTE sobre registrar_enrutamiento.'),
      ('viajapro_webhook',    true,  'apps/worker: resuelve el tenant y procesa el staging.'),
      ('viajapro_enrutador',  false, 'Propietario del directorio y de sus dos funciones. NOLOGIN: no es una credencial.'),
      ('viajapro_staging',    false, 'Propietario del staging y de sus cuatro funciones. Sin ningún privilegio sobre el directorio.')
    ) AS t(nombre, con_login, proposito)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol.nombre) THEN
      -- Los atributos SÍ se pueden declarar al CREAR el rol, incluso sin ser superusuario.
      -- Lo que no se puede es cambiarlos después con ALTER (ver el bloque 2).
      EXECUTE format(
        'CREATE ROLE %I %s NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
        rol.nombre, CASE WHEN rol.con_login THEN 'LOGIN' ELSE 'NOLOGIN' END);
      RAISE NOTICE 'Rol % creado.', rol.nombre;
    END IF;

    -- El propósito de cada rol queda en la propia base: con cinco roles que solo se
    -- distinguen por qué funciones ejecutan, el nombre no basta para saber cuál es cuál.
    BEGIN
      EXECUTE format('COMMENT ON ROLE %I IS %L', rol.nombre, rol.proposito);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Sin privilegio para comentar el rol %.', rol.nombre;
    END;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Reafirmar atributos — y por qué esto puede no poder ejecutarse
--
-- Quitar SUPERUSER o BYPASSRLS con ALTER ROLE exige ser superusuario, y el rol
-- propietario de un PostgreSQL gestionado no lo es: el intento falla con 42501. Por eso
-- el ALTER va dentro de un bloque que tolera ese fallo concreto — y por eso el bloque 5
-- VERIFICA el resultado y aborta si no es el correcto. **Comprobar es mejor que afirmar.**
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  nombre text;
BEGIN
  FOREACH nombre IN ARRAY ARRAY['viajapro_app','viajapro_altas','viajapro_webhook','viajapro_enrutador','viajapro_staging'] LOOP
    BEGIN
      EXECUTE format('ALTER ROLE %I NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE', nombre);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'No se pudieron reafirmar los atributos de % (hace falta superusuario). Se verifican en el bloque 5.', nombre;
    END;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. En Neon, el rol por defecto hereda `neon_superuser`, que tiene BYPASSRLS.
-- Si cualquiera de estos cinco acabara siendo miembro de ese rol, el aislamiento se
-- evapora — y en el caso de los dos propietarios sería peor: el dueño de una función
-- SECURITY DEFINER con BYPASSRLS es una escalada silenciosa el día que alguien amplíe
-- su cuerpo.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  nombre text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') THEN
    FOREACH nombre IN ARRAY ARRAY['viajapro_app','viajapro_altas','viajapro_webhook','viajapro_enrutador','viajapro_staging'] LOOP
      IF pg_has_role(nombre, 'neon_superuser', 'MEMBER') THEN
        EXECUTE format('REVOKE neon_superuser FROM %I', nombre);
        RAISE NOTICE 'Revocada la membresía de neon_superuser en %.', nombre;
      END IF;
    END LOOP;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permisos de conexión y de esquema
--
-- `REVOKE CREATE ON SCHEMA public` es la mitad complementaria del `search_path` vacío
-- de las funciones `SECURITY DEFINER`: con el search_path vacío y todos los objetos
-- cualificados, nadie puede secuestrar una referencia; revocar el CREATE impide además
-- que nadie siembre objetos en `public` para intentarlo. Lo verifica la aserción 21.
--
-- El rol de migraciones se concede a sí mismo la pertenencia a los dos propietarios con
-- SET TRUE e INHERIT FALSE. SET TRUE porque sin él no puede ni traspasar la propiedad de
-- una tabla ni revocar permisos en nombre del dueño (ver la sutileza (a) de `001`).
-- INHERIT FALSE porque heredar sus privilegios sin pedirlo es justo lo que no se quiere.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  nombre text;
BEGIN
  FOREACH nombre IN ARRAY ARRAY['viajapro_app','viajapro_altas','viajapro_webhook'] LOOP
    EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), nombre);
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', nombre);
    EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', nombre);
  END LOOP;

  FOREACH nombre IN ARRAY ARRAY['viajapro_enrutador','viajapro_staging'] LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', nombre);
    EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', nombre);
  END LOOP;

  -- El rol de migraciones puede PONERSE cualquiera de los cinco, pero no hereda nada de
  -- ellos. Hacen falta las dos mitades:
  --   · SET TRUE: sin él no puede traspasar la propiedad de una tabla a un propietario, ni
  --     revocar permisos en nombre del dueño cuando el dueño es otro rol (ver la sutileza
  --     (a) de `001`), ni la prueba de aislamiento puede comprobar el COMPORTAMIENTO de
  --     cada rol sin repartir cinco contraseñas por el entorno de pruebas.
  --   · INHERIT FALSE: heredar sus privilegios sin pedirlo es justo lo que no se quiere.
  -- Esto no amplía nada: el rol de migraciones ya es dueño del esquema y, en Neon, además
  -- hereda BYPASSRLS. Quien lo tenga, lo tiene todo; esa es la razón de que la aplicación
  -- nunca se conecte con él.
  FOREACH nombre IN ARRAY ARRAY['viajapro_app','viajapro_altas','viajapro_webhook','viajapro_enrutador','viajapro_staging'] LOOP
    EXECUTE format('GRANT %I TO %I WITH SET TRUE, INHERIT FALSE', nombre, current_user);
  END LOOP;

  EXECUTE 'REVOKE CREATE ON SCHEMA public FROM PUBLIC';
END;
$$;

-- Y los privilegios sobre tablas, por el ÚNICO mecanismo que los gobierna: el de `001`.
-- Aquí no se escribe ningún GRANT sobre tablas. Que este archivo tuviera el suyo propio,
-- desacoplado de la revocación, es precisamente el defecto crítico que ADR-0008 corrige.
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5. Verificación inmediata. Si algo de esto falla, la configuración NO es segura
-- y es preferible enterarse aquí que en producción.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
    FROM pg_roles
    WHERE rolname IN ('viajapro_app','viajapro_altas','viajapro_webhook','viajapro_enrutador','viajapro_staging')
  LOOP
    IF r.rolbypassrls THEN
      RAISE EXCEPTION '% tiene BYPASSRLS: el aislamiento entre tenants sería ficticio.', r.rolname;
    END IF;
    IF r.rolsuper THEN
      RAISE EXCEPTION '% es superusuario: el aislamiento entre tenants sería ficticio.', r.rolname;
    END IF;
    IF r.rolcanlogin AND r.rolname IN ('viajapro_enrutador','viajapro_staging') THEN
      RAISE EXCEPTION '% puede iniciar sesión: un propietario con LOGIN es una contraseña cuya posesión concede el secuestro de cualquier conversación.', r.rolname;
    END IF;
    IF NOT r.rolcanlogin AND r.rolname IN ('viajapro_app','viajapro_altas','viajapro_webhook') THEN
      RAISE EXCEPTION '% no puede iniciar sesión y la aplicación lo necesita.', r.rolname;
    END IF;
  END LOOP;

  RAISE NOTICE 'Verificado: ninguno de los cinco roles puede saltarse RLS.';
END;
$$;
