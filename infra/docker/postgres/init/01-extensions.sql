-- Extensiones requeridas por el modelo de datos.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid(), cifrado
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- busqueda difusa de contactos
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- busqueda sin tildes
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- indices compuestos jsonb + escalares

-- Rol de aplicacion: NO es superusuario y NO puede saltarse Row Level Security.
-- Todo acceso desde la API pasa por este rol.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app') THEN
    CREATE ROLE viajapro_app LOGIN PASSWORD 'viajapro_app' NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE viajapro TO viajapro_app;
GRANT USAGE ON SCHEMA public TO viajapro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO viajapro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO viajapro_app;
