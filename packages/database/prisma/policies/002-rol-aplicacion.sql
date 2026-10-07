-- =============================================================================
-- Rol de aplicación — R2 y ADR-0003
--
-- La aplicación NUNCA se conecta con el rol propietario ni con uno que pueda saltarse RLS.
-- Si lo hiciera, todas las políticas de aislamiento serían decorativas y nadie se enteraría:
-- las consultas devolverían datos, no habría error, y la fuga entre agencias sería total.
--
-- En PostgreSQL gestionado (Neon) esto importa el doble: el rol que el proveedor crea por
-- defecto es miembro de `neon_superuser`, que tiene BYPASSRLS. Ver ADR-0007.
--
-- Idempotente: se puede volver a ejecutar sin romper nada.
-- =============================================================================

-- La contraseña NO se escribe aquí. Se pasa al ejecutar:
--   psql "$DATABASE_URL" -v app_password="$(openssl rand -base64 24)" \
--        -f prisma/policies/002-rol-aplicacion.sql
\if :{?app_password}
\else
  \echo 'ERROR: falta -v app_password=<contraseña>'
  \quit
\endif

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app') THEN
    CREATE ROLE viajapro_app LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    RAISE NOTICE 'Rol viajapro_app creado.';
  ELSE
    RAISE NOTICE 'El rol viajapro_app ya existe; se reafirman sus atributos.';
  END IF;

  -- Se reafirma siempre, no solo al crearlo: si alguien se los cambió a mano, esto lo corrige.
  ALTER ROLE viajapro_app NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE;
END;
$$;

\set quoted_password '''' :app_password ''''
ALTER ROLE viajapro_app WITH PASSWORD :quoted_password;

-- -----------------------------------------------------------------------------
-- En Neon, el rol por defecto hereda `neon_superuser`, que tiene BYPASSRLS.
-- Si `viajapro_app` acabara siendo miembro de ese rol, el aislamiento se evapora.
-- Esto lo revoca por si el proveedor lo concedió, y falla ruidosamente si no se puede.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') THEN
    IF pg_has_role('viajapro_app', 'neon_superuser', 'MEMBER') THEN
      EXECUTE 'REVOKE neon_superuser FROM viajapro_app';
      RAISE NOTICE 'Revocada la membresía de neon_superuser en viajapro_app.';
    END IF;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- Permisos: lo justo para operar. Ningún DDL: las migraciones usan el rol propietario.
-- -----------------------------------------------------------------------------
-- `GRANT ... ON DATABASE` no admite una expresión como nombre: hay que componer la sentencia.
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO viajapro_app', current_database());
END;
$$;

GRANT USAGE ON SCHEMA public TO viajapro_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO viajapro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO viajapro_app;

-- Las tablas que cree una migración futura también quedan cubiertas, sin tener que
-- acordarse de volver a ejecutar esto.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO viajapro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO viajapro_app;

-- -----------------------------------------------------------------------------
-- Verificación inmediata. Si algo de esto falla, la configuración NO es segura
-- y es preferible enterarse aquí que en producción.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  bypassa boolean;
  es_super boolean;
BEGIN
  SELECT rolbypassrls, rolsuper INTO bypassa, es_super
  FROM pg_roles WHERE rolname = 'viajapro_app';

  IF bypassa THEN
    RAISE EXCEPTION 'viajapro_app tiene BYPASSRLS: el aislamiento entre tenants sería ficticio.';
  END IF;

  IF es_super THEN
    RAISE EXCEPTION 'viajapro_app es superusuario: el aislamiento entre tenants sería ficticio.';
  END IF;

  RAISE NOTICE 'Verificado: viajapro_app no puede saltarse RLS.';
END;
$$;
