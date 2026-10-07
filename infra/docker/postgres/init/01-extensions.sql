-- Extensiones requeridas por el modelo de datos.
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid(), cifrado
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- busqueda difusa de contactos
CREATE EXTENSION IF NOT EXISTS "unaccent";      -- busqueda sin tildes
CREATE EXTENSION IF NOT EXISTS "btree_gin";     -- indices compuestos jsonb + escalares

-- Los roles NO se crean aqui.
--
-- Antes este archivo hacia `CREATE ROLE viajapro_app LOGIN PASSWORD 'viajapro_app'`, y eso
-- ensenaba a poner como contrasena el nombre del rol. Con ADR-0008 hay tres roles de
-- login, y uno de ellos —`viajapro_altas`— es el unico que puede repuntar el numero de
-- WhatsApp de cualquier agencia: la peor primitiva del sistema despues de BYPASSRLS. Una
-- contrasena igual al nombre del rol, publicada en el repositorio, sobre eso.
--
-- Una sola fuente, y es esta:
--
--   pnpm infra:up
--   pnpm db:migrate                                   # crea los cinco roles, SIN contrasena
--   pnpm --filter @viajapro/database run roles:dev    # contrasenas de desarrollo + .env
--
-- Un rol LOGIN sin contrasena no se conecta: el estado por defecto es el seguro.
