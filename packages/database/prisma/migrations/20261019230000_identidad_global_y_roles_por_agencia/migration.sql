-- =============================================================================
-- ADR-0011, rebanada 1 — identidad global, pertenencia por agencia y roles como tabla
--
-- Qué hace, en orden:
--   1. Dos roles nuevos: `viajapro_identidad` (LOGIN) y `viajapro_accesos` (NOLOGIN).
--   2. Cinco tablas GLOBALES de identidad: `identidades`, `credenciales`, `sesiones`,
--      `verificaciones` y `accesos_identidad`. Sin `tenant_id`, declaradas en
--      `excepciones_rls` y tocables SOLO por `viajapro_identidad`.
--   3. `roles`, tabla por tenant con RLS forzada (R12: el `enum rol_usuario` era deuda).
--   4. `usuarios` gana `identidad_id` y `rol_id`, y pierde `rol` y `hash_contrasena`.
--   5. El disparador que mantiene `accesos_identidad`, `SECURITY DEFINER` y propiedad de
--      `viajapro_accesos`.
--
-- **Por qué `accesos_identidad` no tiene una columna `tenant_id`, aunque el ADR la nombre
-- así.** El aplicador de RLS de `001` es dirigido por datos: toda tabla con una columna
-- llamada `tenant_id` recibe la política. Con ese nombre, `accesos_identidad` quedaría
-- aislada por tenant y el selector de agencia —que la lee SIN contexto de tenant, porque es
-- justo lo que todavía no sabe— vería cero filas: el ciclo huevo-gallina del directorio de
-- ADR-0008, que la aserción 17 vigila. Se llama `tenant_acceso_id`, como el directorio usa
-- `tenant_resuelto_id`. Lo mismo para `sesiones.tenant_activo_id`, que ya tenía otro nombre.
--
-- **Sin contraseñas.** `viajapro_identidad` nace LOGIN y sin contraseña: no puede
-- conectarse hasta que el propietario corra `scripts/rotar-roles-y-actualizar-env.ps1`, que
-- desde este cambio rota también este rol y escribe `DATABASE_IDENTIDAD_URL`.
--
-- **NO REVERSIBLE en una parte.** Se borran la columna `usuarios.rol` (el enum) y
-- `usuarios.hash_contrasena`. `hash_contrasena` estaba vacía en toda fila (la autenticación
-- no existía), y `rol` se traduce antes de borrarse a `rol_id`: DUENO y ADMINISTRADOR pasan
-- al rol sembrado `DUENO`; ASESOR y SOLO_LECTURA, a `ASESOR`. El plan de reversión es una
-- migración nueva que recree el enum y lo rellene desde `roles.clave` (con la pérdida de
-- distinguir DUENO de ADMINISTRADOR y ASESOR de SOLO_LECTURA, que hoy nadie usa: la API no
-- leía la columna). El resto —tablas, roles, disparador— se revierte con `DROP`.
--
-- Segura en caliente: `usuarios` tiene un puñado de filas (300 previstas). El paso
-- nullable → relleno → NOT NULL va dentro de esta misma migración por eso.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS citext;

-- -----------------------------------------------------------------------------
-- 1. Los dos roles nuevos. Mismo bloque, mismos atributos que en `policies/002`.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  rol record;
  nombre text;
BEGIN
  FOR rol IN
    SELECT * FROM (VALUES
      ('viajapro_identidad', true,  'Pool de Better Auth (ADR-0011). Solo las tablas globales de identidad, por excepciones_rls. NINGÚN privilegio sobre tablas de negocio: no está en roles_de_aplicacion.'),
      ('viajapro_accesos',   false, 'Propietario de sincronizar_acceso_identidad. NOLOGIN: no es una credencial. Solo escribe accesos_identidad.')
    ) AS t(nombre, con_login, proposito)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol.nombre) THEN
      EXECUTE format(
        'CREATE ROLE %I %s NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT',
        rol.nombre, CASE WHEN rol.con_login THEN 'LOGIN' ELSE 'NOLOGIN' END);
    END IF;
    BEGIN
      EXECUTE format('COMMENT ON ROLE %I IS %L', rol.nombre, rol.proposito);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE 'Sin privilegio para comentar el rol %.', rol.nombre;
    END;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser') THEN
    FOREACH nombre IN ARRAY ARRAY['viajapro_identidad', 'viajapro_accesos'] LOOP
      IF pg_has_role(nombre, 'neon_superuser', 'MEMBER') THEN
        EXECUTE format('REVOKE neon_superuser FROM %I', nombre);
      END IF;
    END LOOP;
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO viajapro_identidad', current_database());
  GRANT USAGE ON SCHEMA public TO viajapro_identidad, viajapro_accesos;
  REVOKE CREATE ON SCHEMA public FROM viajapro_identidad, viajapro_accesos;

  -- Como con los otros cinco: el rol de migraciones puede PONÉRSELOS (para traspasar
  -- propiedad y para que la prueba compruebe comportamiento), pero no hereda nada.
  EXECUTE format('GRANT viajapro_identidad TO %I WITH SET TRUE, INHERIT FALSE', current_user);
  EXECUTE format('GRANT viajapro_accesos TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Tablas globales de identidad
--
-- Una persona existe antes de elegir agencia y el inicio de sesión ocurre sin
-- `app.current_tenant`: no pueden llevar tenant. Su riesgo es el de toda tabla global —una
-- consulta sin filtro expondría las sesiones de todas las agencias—, y la respuesta es la
-- de ADR-0008: solo un rol puede tocarlas, y ese rol no ve nada más.
-- -----------------------------------------------------------------------------
CREATE TABLE "identidades" (
    "id"                UUID         NOT NULL,
    -- citext: «Ana@Agencia.co» y «ana@agencia.co» son la misma persona. Con varchar y un
    -- índice único sensible a mayúsculas serían dos identidades y dos contraseñas.
    "correo"            CITEXT       NOT NULL,
    "correo_verificado" BOOLEAN      NOT NULL DEFAULT false,
    "nombre"            VARCHAR(200) NOT NULL,
    "creado_en"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"    TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en"      TIMESTAMPTZ(3),

    CONSTRAINT "identidades_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "identidades_correo_no_vacio" CHECK (length(btrim("correo"::text)) > 0)
);
CREATE UNIQUE INDEX "identidades_correo_key" ON "identidades"("correo");

CREATE TABLE "credenciales" (
    "id"              UUID         NOT NULL,
    "identidad_id"    UUID         NOT NULL,
    -- `credential` para correo y contraseña. Texto y no enum: es el identificador de
    -- proveedor de la biblioteca, no un concepto nuestro.
    "proveedor"       VARCHAR(50)  NOT NULL,
    -- scrypt, el valor por defecto de Better Auth. Nulo para proveedores sin contraseña.
    "hash_contrasena" TEXT,
    "creado_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"  TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credenciales_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "credenciales_identidad_id_proveedor_key" ON "credenciales"("identidad_id", "proveedor");

CREATE TABLE "sesiones" (
    "id"               UUID         NOT NULL,
    "identidad_id"     UUID         NOT NULL,
    -- Debe guardarse HASHEADO (ADR-0011, requisito del auditor para la rebanada 2). El
    -- esquema no lo impone porque el formato del hash lo decide el adaptador.
    "token"            TEXT         NOT NULL,
    "expira_en"        TIMESTAMPTZ(3) NOT NULL,
    -- Nulo hasta que se elige agencia. NO decide nada: la comprobación que cuenta es la
    -- lectura de `usuarios` bajo RLS con este valor como tenant (paso 4 del flujo).
    "tenant_activo_id" UUID,
    "ip"               VARCHAR(45),
    "agente_usuario"   TEXT,
    "creado_en"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"   TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sesiones_token_key" ON "sesiones"("token");
CREATE INDEX "sesiones_identidad_id_idx" ON "sesiones"("identidad_id");
-- La purga de Ley 1581 (30 días después de caducar) recorre por aquí.
CREATE INDEX "sesiones_expira_en_idx" ON "sesiones"("expira_en");
CREATE INDEX "sesiones_tenant_activo_id_idx" ON "sesiones"("tenant_activo_id");

CREATE TABLE "verificaciones" (
    "id"             UUID         NOT NULL,
    "identificador"  TEXT         NOT NULL,
    -- Código de un solo uso o de recuperación. Debe guardarse hasheado (`storeOTP`).
    "valor"          TEXT         NOT NULL,
    "expira_en"      TIMESTAMPTZ(3) NOT NULL,
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verificaciones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verificaciones_identificador_idx" ON "verificaciones"("identificador");
CREATE INDEX "verificaciones_expira_en_idx" ON "verificaciones"("expira_en");

-- Índice, no autoridad: dice en qué agencias está una identidad para pintar el selector.
-- Si se desincroniza con `usuarios`, el resultado es negar el acceso, nunca concederlo.
CREATE TABLE "accesos_identidad" (
    "identidad_id"     UUID NOT NULL,
    "tenant_acceso_id" UUID NOT NULL,
    "creado_en"        TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accesos_identidad_pkey" PRIMARY KEY ("identidad_id", "tenant_acceso_id")
);
CREATE INDEX "accesos_identidad_tenant_acceso_id_idx" ON "accesos_identidad"("tenant_acceso_id");

ALTER TABLE "credenciales" ADD CONSTRAINT "credenciales_identidad_id_fkey"
  FOREIGN KEY ("identidad_id") REFERENCES "identidades"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_identidad_id_fkey"
  FOREIGN KEY ("identidad_id") REFERENCES "identidades"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_tenant_activo_id_fkey"
  FOREIGN KEY ("tenant_activo_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE "accesos_identidad" ADD CONSTRAINT "accesos_identidad_identidad_id_fkey"
  FOREIGN KEY ("identidad_id") REFERENCES "identidades"("id") ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "accesos_identidad" ADD CONSTRAINT "accesos_identidad_tenant_acceso_id_fkey"
  FOREIGN KEY ("tenant_acceso_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- La declaración. Una fila por par (tabla, rol), con los tres roles de siempre a CERO de
-- forma explícita: «así se declara» (ADR-0011 §6), no por omisión.
INSERT INTO excepciones_rls (tabla, rol, privilegios, motivo) VALUES
  ('identidades',       'viajapro_identidad', '{SELECT,INSERT,UPDATE,DELETE}', 'Identidad global de una persona (ADR-0011): existe antes de elegir agencia. Solo el pool de Better Auth la toca.'),
  ('credenciales',      'viajapro_identidad', '{SELECT,INSERT,UPDATE,DELETE}', 'Hashes de contraseña. Globales porque la credencial es de la persona, no de la agencia. Solo el pool de Better Auth.'),
  ('sesiones',          'viajapro_identidad', '{SELECT,INSERT,UPDATE,DELETE}', 'Sesiones de todas las agencias: el inicio de sesión ocurre sin tenant. Solo el pool de Better Auth; una lectura sin filtro con otro rol expondría sesiones ajenas.'),
  ('verificaciones',    'viajapro_identidad', '{SELECT,INSERT,UPDATE,DELETE}', 'Códigos de un solo uso y de recuperación, previos a la sesión. Solo el pool de Better Auth.'),
  ('accesos_identidad', 'viajapro_identidad', '{SELECT}',                      'Índice (identidad, agencia) para el selector, que corre sin tenant. Solo lectura: la escribe el disparador de usuarios como viajapro_accesos.'),
  ('identidades',       'viajapro_app',     '{}', 'ADR-0011: el código de negocio no ve la identidad global. Lo que necesita está en usuarios, bajo RLS.'),
  ('identidades',       'viajapro_altas',   '{}', 'ADR-0011: el código de negocio no ve la identidad global.'),
  ('identidades',       'viajapro_webhook', '{}', 'ADR-0011: el código de negocio no ve la identidad global.'),
  ('credenciales',      'viajapro_app',     '{}', 'ADR-0011: hashes de contraseña de todas las agencias. Nada que hacer aquí.'),
  ('credenciales',      'viajapro_altas',   '{}', 'ADR-0011: hashes de contraseña de todas las agencias. Nada que hacer aquí.'),
  ('credenciales',      'viajapro_webhook', '{}', 'ADR-0011: hashes de contraseña de todas las agencias. Nada que hacer aquí.'),
  ('sesiones',          'viajapro_app',     '{}', 'ADR-0011: la sesión la valida el pool de identidad; la API de negocio no lee tokens.'),
  ('sesiones',          'viajapro_altas',   '{}', 'ADR-0011: la sesión la valida el pool de identidad.'),
  ('sesiones',          'viajapro_webhook', '{}', 'ADR-0011: la sesión la valida el pool de identidad.'),
  ('verificaciones',    'viajapro_app',     '{}', 'ADR-0011: códigos de un solo uso. Nada que hacer aquí.'),
  ('verificaciones',    'viajapro_altas',   '{}', 'ADR-0011: códigos de un solo uso. Nada que hacer aquí.'),
  ('verificaciones',    'viajapro_webhook', '{}', 'ADR-0011: códigos de un solo uso. Nada que hacer aquí.'),
  ('accesos_identidad', 'viajapro_app',     '{}', 'ADR-0011: la escribe solo el disparador (viajapro_accesos). Escribible por la API, una agencia se apuntaría identidades ajenas.'),
  ('accesos_identidad', 'viajapro_altas',   '{}', 'ADR-0011: la escribe solo el disparador (viajapro_accesos).'),
  ('accesos_identidad', 'viajapro_webhook', '{}', 'ADR-0011: la escribe solo el disparador (viajapro_accesos).')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

-- -----------------------------------------------------------------------------
-- 3. Roles por agencia (R12, ADR-0006)
--
-- Cómo agrupa cada agencia sus permisos es política: tabla. Lo que el sistema SABE hacer
-- es invariante: el catálogo cerrado del CHECK, reflejo del `z.enum` PERMISOS de
-- `packages/contracts/src/identidad.ts`. Añadir un permiso es editar los dos.
-- -----------------------------------------------------------------------------
CREATE TABLE "roles" (
    "id"             UUID         NOT NULL,
    "tenant_id"      UUID         NOT NULL,
    "nombre"         VARCHAR(80)  NOT NULL,
    -- Solo los tres roles sembrados la llevan, para que la semilla los encuentre aunque la
    -- agencia los renombre. Los que cree la agencia van sin clave.
    "clave"          VARCHAR(32),
    "permisos"       TEXT[]       NOT NULL DEFAULT '{}',
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "roles_permisos_del_catalogo" CHECK (
      "permisos" <@ ARRAY[
        'cotizacion.ver_neto_y_margen',
        'usuarios.administrar',
        'roles.administrar',
        'conversaciones.ver_todas'
      ]::text[]
      AND array_position("permisos", NULL) IS NULL
    ),
    CONSTRAINT "roles_clave_sembrada" CHECK ("clave" IS NULL OR "clave" IN ('DUENO', 'ASESOR', 'OPERACIONES')),
    CONSTRAINT "roles_nombre_no_vacio" CHECK (length(btrim("nombre")) > 0)
);
CREATE UNIQUE INDEX "roles_tenant_id_nombre_key" ON "roles"("tenant_id", "nombre");
CREATE UNIQUE INDEX "roles_id_tenant_id_key" ON "roles"("id", "tenant_id");
CREATE UNIQUE INDEX "roles_tenant_id_clave_key" ON "roles"("tenant_id", "clave");
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- uuid v7 en SQL, solo para el relleno de abajo (la aplicación los genera con Prisma). Es la
-- marca de tiempo en milisegundos sobre los 48 bits altos de un v4, con la versión puesta a 7.
CREATE FUNCTION pg_temp.uuid_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
              PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
              FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;

-- Los tres roles sembrados, para toda agencia que ya exista. Las nuevas los reciben de la
-- semilla o del script de alta de plataforma (rebanada 4).
INSERT INTO "roles" ("id", "tenant_id", "nombre", "clave", "permisos", "actualizado_en")
SELECT pg_temp.uuid_v7(), t.id, s.nombre, s.clave, s.permisos, now()
FROM "tenants" t
CROSS JOIN (VALUES
  ('Dueño',       'DUENO',       ARRAY['cotizacion.ver_neto_y_margen','usuarios.administrar','roles.administrar','conversaciones.ver_todas']::text[]),
  ('Asesor',      'ASESOR',      ARRAY[]::text[]),
  ('Operaciones', 'OPERACIONES', ARRAY['conversaciones.ver_todas']::text[])
) AS s(nombre, clave, permisos)
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. usuarios: de cuenta por agencia a pertenencia de una identidad global
-- -----------------------------------------------------------------------------
ALTER TABLE "usuarios" ADD COLUMN "identidad_id" UUID;
ALTER TABLE "usuarios" ADD COLUMN "rol_id" UUID;

CREATE UNIQUE INDEX "usuarios_tenant_id_identidad_id_key" ON "usuarios"("tenant_id", "identidad_id");
CREATE INDEX "usuarios_identidad_id_idx" ON "usuarios"("identidad_id");
CREATE INDEX "usuarios_tenant_id_rol_id_idx" ON "usuarios"("tenant_id", "rol_id");

-- RESTRICT: el historial (notas, mensajes, cotizaciones) apunta a usuarios; suprimir una
-- identidad es anonimizar, no borrar en cascada.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_identidad_id_fkey"
  FOREIGN KEY ("identidad_id") REFERENCES "identidades"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
-- COMPUESTA: un usuario de la agencia B no puede llevar el rol de la A. Y NO ACTION, no
-- RESTRICT: al borrar un tenant, la cascada se lleva roles y usuarios en la misma
-- sentencia, y RESTRICT se comprobaría a mitad de ella, en el orden que elija el motor.
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_tenant_id_fkey"
  FOREIGN KEY ("rol_id", "tenant_id") REFERENCES "roles"("id", "tenant_id") ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 5. El disparador de `accesos_identidad`
--
-- Lo dispara quien escribe `usuarios` (viajapro_app, bajo RLS), así que la fila de NEW ya
-- pasó el WITH CHECK de su agencia: la función solo puede apuntar el par
-- (NEW.identidad_id, NEW.tenant_id) de una pertenencia legítima. No puede registrar un
-- acceso a otro tenant.
--
-- Si en un UPDATE cambia la identidad o el tenant, el par VIEJO se borra (cola de
-- ADR-0011, entra en esta rebanada): sin eso, repuntar una fila de `usuarios` dejaría a la
-- identidad anterior con el selector apuntando a una agencia a la que ya no pertenece. No
-- entraría (el paso 4 lo niega), pero sabría que existe.
--
-- Los bloques entre marcas `[par-old]` los quita a propósito el arnés de mutaciones
-- (M17): no cambiar las marcas sin cambiar el arnés.
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.sincronizar_acceso_identidad()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.accesos_identidad
     WHERE identidad_id = OLD.identidad_id AND tenant_acceso_id = OLD.tenant_id;
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- [par-old]
    IF OLD.identidad_id IS DISTINCT FROM NEW.identidad_id
       OR OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      DELETE FROM public.accesos_identidad
       WHERE identidad_id = OLD.identidad_id AND tenant_acceso_id = OLD.tenant_id;
    END IF;
    -- [/par-old]
    NULL;
  END IF;

  IF NEW.identidad_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.activo AND NEW.eliminado_en IS NULL THEN
    INSERT INTO public.accesos_identidad (identidad_id, tenant_acceso_id)
    VALUES (NEW.identidad_id, NEW.tenant_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.accesos_identidad
     WHERE identidad_id = NEW.identidad_id AND tenant_acceso_id = NEW.tenant_id;
  END IF;

  RETURN NULL;
END;
$func$;

-- REVOKE antes de traspasar la propiedad, o es un no-op con AVISO. Nadie recibe EXECUTE:
-- PostgreSQL no lo comprueba al disparar, solo al crear el disparador.
REVOKE ALL ON FUNCTION public.sincronizar_acceso_identidad() FROM PUBLIC;
COMMENT ON FUNCTION public.sincronizar_acceso_identidad() IS
  'Mantiene accesos_identidad desde usuarios: alta, baja, desactivación y repunte (borra el par OLD). ADR-0011.';

CREATE TRIGGER usuarios_sincronizar_acceso_identidad
  AFTER INSERT OR DELETE OR UPDATE OF identidad_id, tenant_id, activo, eliminado_en
  ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_acceso_identidad();

-- Lo único que puede hacer su dueño. Ni UPDATE ni TRUNCATE: un par se pone o se quita.
GRANT SELECT, INSERT, DELETE ON TABLE public.accesos_identidad TO viajapro_accesos;

GRANT CREATE ON SCHEMA public TO viajapro_accesos;
ALTER FUNCTION public.sincronizar_acceso_identidad() OWNER TO viajapro_accesos;
REVOKE CREATE ON SCHEMA public FROM viajapro_accesos;

-- -----------------------------------------------------------------------------
-- 6. Relleno de lo que ya existe (la agencia demo y la piloto)
--
-- Una identidad por correo, sin distinguir mayúsculas: si la misma persona ya tenía cuenta
-- en dos agencias, ahora es una identidad con dos pertenencias, que es justo el modelo.
-- El UPDATE dispara el disparador de arriba y rellena `accesos_identidad` por el camino
-- normal, no a mano.
-- -----------------------------------------------------------------------------
INSERT INTO "identidades" ("id", "correo", "nombre", "actualizado_en")
SELECT pg_temp.uuid_v7(), x.correo, x.nombre, now()
FROM (
  SELECT DISTINCT ON (lower(u.correo)) lower(u.correo) AS correo, u.nombre
  FROM "usuarios" u
  ORDER BY lower(u.correo), u.creado_en
) x
ON CONFLICT ("correo") DO NOTHING;

UPDATE "usuarios" u
   SET "identidad_id" = i.id,
       "rol_id" = r.id
  FROM "identidades" i, "roles" r
 WHERE i.correo = lower(u.correo)::citext
   AND r.tenant_id = u.tenant_id
   AND r.clave = CASE WHEN u.rol::text IN ('DUENO', 'ADMINISTRADOR') THEN 'DUENO' ELSE 'ASESOR' END;

ALTER TABLE "usuarios" ALTER COLUMN "identidad_id" SET NOT NULL;
ALTER TABLE "usuarios" ALTER COLUMN "rol_id" SET NOT NULL;

ALTER TABLE "usuarios" DROP COLUMN "rol";
ALTER TABLE "usuarios" DROP COLUMN "hash_contrasena";
DROP TYPE "rol_usuario";

-- -----------------------------------------------------------------------------
-- 7. RLS y privilegios, por el único mecanismo que los gobierna
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('roles');
-- `usuarios` ya la tenía; se reaplica para que nadie tenga que comprobar que sigue igual
-- tras un ALTER TABLE.
SELECT aplicar_aislamiento_tenant('usuarios');
SELECT aplicar_privilegios_declarados();

-- Verificación inmediata: si algo de esto falla, la configuración no es segura.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT rolname, rolsuper, rolbypassrls, rolcanlogin FROM pg_roles
            WHERE rolname IN ('viajapro_identidad', 'viajapro_accesos') LOOP
    IF r.rolbypassrls OR r.rolsuper THEN
      RAISE EXCEPTION '% se salta RLS: el aislamiento sería ficticio.', r.rolname;
    END IF;
    IF r.rolname = 'viajapro_accesos' AND r.rolcanlogin THEN
      RAISE EXCEPTION 'viajapro_accesos puede iniciar sesión: un propietario no es una credencial.';
    END IF;
  END LOOP;

  IF has_table_privilege('viajapro_identidad', 'public.usuarios', 'SELECT') THEN
    RAISE EXCEPTION 'viajapro_identidad puede leer usuarios: no puede estar en roles_de_aplicacion.';
  END IF;
  IF has_table_privilege('viajapro_app', 'public.sesiones', 'SELECT') THEN
    RAISE EXCEPTION 'viajapro_app puede leer sesiones: la revocación declarada no se aplicó.';
  END IF;
END;
$$;
