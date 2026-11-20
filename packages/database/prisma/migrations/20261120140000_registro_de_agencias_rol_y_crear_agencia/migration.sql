-- =============================================================================
-- T-268, ADR-0030 F1 — registro autoservicio de agencias: `viajapro_registro`, `crear_agencia`,
-- `codigo_de_acceso_vigente`, columnas de `tenants` y de `perfiles_de_agencia`, y cuatro tablas
-- globales
--
-- Hoy ningún rol de aplicación puede insertar en `tenants` (global, exceptuada de RLS, `{SELECT}` para
-- `viajapro_app`). ADR-0030 elige la opción D: la agencia nace por una función SECURITY DEFINER cuyo
-- dueño es un rol NOLOGIN, y `viajapro_app` sigue sin poder escribir `tenants` por ningún camino
-- directo. Mismo patrón que `viajapro_ajustes` (ADR-0027, 20261116090000) y `viajapro_planificador`
-- (ADR-0024 §5.3, 20261118090100).
--
-- Qué hace, en orden:
--   1. Las filas de `excepciones_rls` de las cuatro tablas globales nuevas, ANTES de crearlas: así
--      ninguna llamada intermedia a `aplicar_privilegios_declarados()` (la de esta misma migración o
--      la de una reaplicación de `001`) les deja el `GRANT ... ON ALL TABLES` de la concesión general.
--   2. Rol `viajapro_registro`, NOLOGIN NOBYPASSRLS NOINHERIT. El rol de migraciones se lo PONE
--      (SET TRUE) para crear las funciones y no hereda nada (INHERIT FALSE).
--   3. `tenants`: enum `origen_del_alta` (NOT NULL DEFAULT 'PLATAFORMA'), `creado_por_identidad_id`,
--      `prueba_termina_en`, `encargo_version` y `encargo_aceptado_en`. La declaración de `tenants`
--      para `viajapro_app` NO cambia: sigue `{SELECT}`.
--   4. Tablas globales: `aceptaciones_de_identidad` y `codigos_de_registro` (solo
--      `viajapro_identidad`), `codigos_de_acceso_al_registro` y `parametros_del_registro` (ningún rol
--      de login; solo la plataforma y `viajapro_registro` por columnas).
--   5. `perfiles_de_agencia` ya existe (20261120130000, T-261: `rnt`, `verificado_en`, RLS con USING
--      y WITH CHECK, solo `viajapro_app` por `privilegios_declarados`). Aquí se le AÑADEN `nit`,
--      `digito_verificacion` y `razon_social`, y se REEMPLAZA `proteger_verificacion_del_perfil`,
--      como pide el aviso de aquella migración: cambiar el NIT (o su DV) anula `verificado_en`
--      igual que cambiar el RNT.
--   6. `aplicar_privilegios_declarados()`: revoca lo que la concesión por defecto dio a las tablas
--      nuevas y aplica lo declarado en el paso 1.
--   7. Superficie de `viajapro_registro`, SOLO por columnas (ADR-0030 §3.1).
--   8. `crear_agencia` (decimosexta SECURITY DEFINER) y `codigo_de_acceso_vigente` (decimoséptima),
--      creadas bajo `SET ROLE viajapro_registro`; EXECUTE solo para `viajapro_app`.
--   9. Cinturón: todo lo anterior, comprobado contra el catálogo. Si la superficie real difiere de la
--      declarada, la migración ABORTA.
--
-- **El contrato que usa la API** (T-271; traducción por SQLSTATE, no por texto, ADR-0030 §3.2):
--   SELECT public.crear_agencia($1 nombre, $2 slug_base, $3 pais_iso, $4 moneda_iso, $5 zona,
--                               $6 identidad_id, $7 dias_de_prueba, $8 version_encargo,
--                               $9 sha256(codigo_de_acceso), $10 hmac(correo)) AS tenant_id
--     · éxito → el id (uuid v4, lo elige la base) de una agencia NUEVA, EN_PRUEBA y AUTOSERVICIO; y
--       `app.current_tenant` queda fijado a ese id hasta el final de la transacción (supuesto S1).
--     · 22023 dato inválido (nombre, slug, país, moneda, zona, días, versión, identidad nula) → 422.
--     · 42501 `app.current_tenant` no estaba vacío al llamar → 500 (error de programación).
--     · VPR01 la identidad ya tiene una agencia de autoservicio EN_PRUEBA → 409.
--     · VPR02 tope global por hora (`parametros_del_registro.tope_por_hora`) → 503 + Retry-After.
--     · VPR03 sin slug libre tras el base y 5 sufijos → 500.
--     · VPR04 código de acceso inexistente, usado, caducado o de otro correo (sin distinguir) → 422.
--   SELECT public.codigo_de_acceso_vigente($1 sha256(codigo), $2 hmac(correo)) → boolean, sin
--   consumirlo y sin decir por qué no.
--
-- **Qué protege y qué no** (ADR-0030 §3.5). La función solo INSERTA en `tenants` (ni UPDATE ni
-- DELETE ni TRUNCATE en su superficie), el id lo genera ella, el único ON CONFLICT es DO NOTHING por
-- slug y el contexto lo fija solo si estaba vacío. Quien ejecute SQL arbitrario como `viajapro_app`
-- puede crear agencias, una por código de acceso válido que tenga y hasta el tope por hora; no puede
-- entrar en una existente. `p_identidad_id` no es frontera de aislamiento: es la llave del límite.
--
-- Toda modificación del cuerpo de las dos funciones vuelve a pasar por `auditor-seguridad`.
--
-- **Datos personales (R10).** `perfiles_de_agencia.nit` puede ser la cédula de una persona natural:
-- queda en claro bajo RLS, como decide ADR-0030 §3.3 (y «Negativas»); si `auditor-seguridad` lo
-- considera PII sensible, entra en ADR-0015. `tenants` solo gana un id de identidad, sin datos
-- personales. Los códigos se guardan como SHA-256 / HMAC, nunca en claro.
--
-- **Segura en caliente.** Columnas nulables o con DEFAULT constante (sin reescritura), CHECK que
-- validan `tenants` (decenas de filas: todas PLATAFORMA y sin encargo) y `perfiles_de_agencia` (las
-- columnas nuevas nacen NULL), dos índices y una foránea sobre `tenants` construidos sin CONCURRENTLY
-- (Prisma corre el archivo en una transacción); tablas nuevas, GRANT y un CREATE OR REPLACE del
-- disparador (la API desplegada solo escribe `rnt`, y el comportamiento sobre `rnt` no cambia). Con volumen en `tenants` (no lo habrá: una fila por agencia) seguiría siendo trivial.
--
-- **REVERSIBLE** con una migración posterior (ADR-0030 «Qué habría que cambiar para revertir esto»;
-- la API tiene que dejar de llamarlas antes):
--   DROP FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea);
--   DROP FUNCTION public.codigo_de_acceso_vigente(bytea, bytea);
--   REVOKE ALL ON TABLE public.tenants, public.monedas, public.codigos_de_acceso_al_registro,
--     public.parametros_del_registro FROM viajapro_registro;   -- también los de columna
--   REVOKE viajapro_registro FROM <rol de migraciones>;  -- y DROP ROLE, que es global al clúster:
--                                                         -- solo si ninguna otra base lo usa.
--   Las tablas de códigos se pueden vaciar. Las columnas de `tenants`, las nuevas de
--   `perfiles_de_agencia` y `aceptaciones_de_identidad` SE CONSERVAN: son datos y evidencia legal.
--   (El disparador ampliado puede quedarse: sin columnas nuevas que cambien, se comporta como el de
--   T-261.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las excepciones, ANTES que las tablas (R1, ADR-0008 §1.2)
-- -----------------------------------------------------------------------------
INSERT INTO excepciones_rls (tabla, rol, privilegios, motivo) VALUES
  ('aceptaciones_de_identidad', 'viajapro_app',       '{}', 'Evidencia de que la persona aceptó términos y aviso de privacidad de ViajaPro (ADR-0030 §4). Es de la identidad, no de la agencia. Solo viajapro_identidad.'),
  ('aceptaciones_de_identidad', 'viajapro_altas',     '{}', 'Evidencia de que la persona aceptó términos y aviso de privacidad de ViajaPro (ADR-0030 §4). Es de la identidad, no de la agencia. Solo viajapro_identidad.'),
  ('aceptaciones_de_identidad', 'viajapro_webhook',   '{}', 'Evidencia de que la persona aceptó términos y aviso de privacidad de ViajaPro (ADR-0030 §4). Es de la identidad, no de la agencia. Solo viajapro_identidad.'),
  ('aceptaciones_de_identidad', 'viajapro_identidad', '{SELECT,INSERT}', 'El pool de identidad la escribe en registro/completar, en la misma transacción que la identidad. Sin UPDATE ni DELETE: es evidencia (ADR-0030 §3.3).'),
  ('codigos_de_registro', 'viajapro_app',       '{}', 'Código de registro previo a la identidad: no hay agencia todavía (ADR-0030 §3.7). Solo viajapro_identidad.'),
  ('codigos_de_registro', 'viajapro_altas',     '{}', 'Código de registro previo a la identidad: no hay agencia todavía (ADR-0030 §3.7). Solo viajapro_identidad.'),
  ('codigos_de_registro', 'viajapro_webhook',   '{}', 'Código de registro previo a la identidad: no hay agencia todavía (ADR-0030 §3.7). Solo viajapro_identidad.'),
  ('codigos_de_registro', 'viajapro_identidad', '{SELECT,INSERT,UPDATE,DELETE}', 'Emitir (ON CONFLICT por correo_hmac), consumir el intento con UPDATE atómico y borrar al acertar (ADR-0030 §3.7).'),
  ('codigos_de_acceso_al_registro', 'viajapro_app',       '{}', 'Código de acceso del piloto (ADR-0030 §3.8). Ningún rol de login lo toca: lo crea la plataforma y solo lo leen y consumen crear_agencia y codigo_de_acceso_vigente (dueño viajapro_registro).'),
  ('codigos_de_acceso_al_registro', 'viajapro_altas',     '{}', 'Código de acceso del piloto (ADR-0030 §3.8). Ningún rol de login lo toca: lo crea la plataforma y solo lo leen y consumen crear_agencia y codigo_de_acceso_vigente (dueño viajapro_registro).'),
  ('codigos_de_acceso_al_registro', 'viajapro_webhook',   '{}', 'Código de acceso del piloto (ADR-0030 §3.8). Ningún rol de login lo toca: lo crea la plataforma y solo lo leen y consumen crear_agencia y codigo_de_acceso_vigente (dueño viajapro_registro).'),
  ('codigos_de_acceso_al_registro', 'viajapro_identidad', '{}', 'Código de acceso del piloto (ADR-0030 §3.8). Ningún rol de login lo toca: lo crea la plataforma y solo lo leen y consumen crear_agencia y codigo_de_acceso_vigente (dueño viajapro_registro).'),
  ('parametros_del_registro', 'viajapro_app',       '{}', 'Tope global de altas por hora (ADR-0030 §3.2). Solo lo escribe la plataforma; solo lo lee crear_agencia (dueño viajapro_registro).'),
  ('parametros_del_registro', 'viajapro_altas',     '{}', 'Tope global de altas por hora (ADR-0030 §3.2). Solo lo escribe la plataforma; solo lo lee crear_agencia (dueño viajapro_registro).'),
  ('parametros_del_registro', 'viajapro_webhook',   '{}', 'Tope global de altas por hora (ADR-0030 §3.2). Solo lo escribe la plataforma; solo lo lee crear_agencia (dueño viajapro_registro).'),
  ('parametros_del_registro', 'viajapro_identidad', '{}', 'Tope global de altas por hora (ADR-0030 §3.2). Solo lo escribe la plataforma; solo lo lee crear_agencia (dueño viajapro_registro).')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

-- -----------------------------------------------------------------------------
-- 2. El rol propietario. Mismo bloque, mismos atributos que `viajapro_ajustes` y
--    `viajapro_planificador`.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_registro') THEN
    CREATE ROLE viajapro_registro NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  BEGIN
    COMMENT ON ROLE viajapro_registro IS
      'Propietario de crear_agencia y codigo_de_acceso_vigente (ADR-0030 §3.1). NOLOGIN: no es una credencial. Solo inserta en tenants (por columnas), lee columnas de tenants, monedas y parametros_del_registro, y consume codigos_de_acceso_al_registro.';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Sin privilegio para comentar el rol viajapro_registro.';
  END;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neon_superuser')
     AND pg_has_role('viajapro_registro', 'neon_superuser', 'MEMBER') THEN
    REVOKE neon_superuser FROM viajapro_registro;
  END IF;

  GRANT USAGE ON SCHEMA public TO viajapro_registro;

  -- El rol de migraciones puede PONÉRSELO (para crear las funciones como su dueño), sin heredar.
  EXECUTE format('GRANT viajapro_registro TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. `tenants`: el origen del alta, quién la creó, la prueba y el contrato de encargo
--
-- `origen_del_alta` es un invariante del sistema, no política de la agencia (R12): enum.
-- `creado_por_identidad_id` es solo un id. RESTRICT: es quien aceptó el encargo en nombre de la
-- agencia (ADR-0030 §4.2), y la supresión de una identidad (ADR-0011) no borra la fila.
-- -----------------------------------------------------------------------------
CREATE TYPE "origen_del_alta" AS ENUM ('PLATAFORMA', 'AUTOSERVICIO');

ALTER TABLE "tenants"
  ADD COLUMN "origen_del_alta"         "origen_del_alta" NOT NULL DEFAULT 'PLATAFORMA',
  ADD COLUMN "creado_por_identidad_id" UUID,
  ADD COLUMN "prueba_termina_en"       TIMESTAMPTZ(3),
  ADD COLUMN "encargo_version"         VARCHAR(40),
  ADD COLUMN "encargo_aceptado_en"     TIMESTAMPTZ(3);

ALTER TABLE "tenants" ADD CONSTRAINT "tenants_creado_por_identidad_id_fkey"
  FOREIGN KEY ("creado_por_identidad_id") REFERENCES "identidades" ("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- La versión y la fecha del encargo van juntas o no van.
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_encargo_completo"
  CHECK (("encargo_version" IS NULL) = ("encargo_aceptado_en" IS NULL));
-- Una agencia de autoservicio sin quién, sin fin de prueba o sin encargo no es representable.
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_autoservicio_completo"
  CHECK ("origen_del_alta" <> 'AUTOSERVICIO'
         OR ("creado_por_identidad_id" IS NOT NULL
             AND "prueba_termina_en" IS NOT NULL
             AND "encargo_version" IS NOT NULL
             AND "encargo_aceptado_en" IS NOT NULL));

-- Los dos límites de `crear_agencia`: VPR01 (por identidad) y VPR02 (altas de la última hora).
CREATE INDEX "tenants_creado_por_identidad_id_idx" ON "tenants" ("creado_por_identidad_id");
CREATE INDEX "tenants_origen_del_alta_creado_en_idx" ON "tenants" ("origen_del_alta", "creado_en");

COMMENT ON COLUMN "tenants"."origen_del_alta" IS
  'PLATAFORMA (scripts) o AUTOSERVICIO (crear_agencia, ADR-0030). Invariante del sistema, no política de la agencia.';
COMMENT ON COLUMN "tenants"."creado_por_identidad_id" IS
  'Identidad que creó la agencia por autoservicio y aceptó el contrato de encargo en su nombre. Solo un id.';
COMMENT ON COLUMN "tenants"."prueba_termina_en" IS
  'Fin de la prueba gratis (UTC). Sin corte automático: «vencida» = EN_PRUEBA AND prueba_termina_en < now() (ADR-0030 §2).';

-- -----------------------------------------------------------------------------
-- 4. Las cuatro tablas globales. Ninguna tiene, ni tendrá, una columna `tenant_id`.
-- -----------------------------------------------------------------------------
CREATE TYPE "documento_legal" AS ENUM ('TERMINOS', 'AVISO_DE_PRIVACIDAD');
CREATE TYPE "canal_de_aceptacion" AS ENUM ('WEB_REGISTRO', 'INVITACION');

-- 4.1 Evidencia de consentimiento de la PERSONA (ViajaPro como responsable, ADR-0030 §4.1).
CREATE TABLE "aceptaciones_de_identidad" (
    "id"           UUID                  NOT NULL,
    "identidad_id" UUID                  NOT NULL,
    "documento"    "documento_legal"     NOT NULL,
    "version"      VARCHAR(40)           NOT NULL,
    "canal"        "canal_de_aceptacion" NOT NULL,
    "aceptado_en"  TIMESTAMPTZ(3)        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aceptaciones_de_identidad_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "aceptaciones_de_identidad_version_no_vacia" CHECK (length(btrim("version")) > 0)
);
CREATE INDEX "aceptaciones_de_identidad_identidad_id_idx" ON "aceptaciones_de_identidad" ("identidad_id");
-- RESTRICT: suprimir una identidad no borra sus aceptaciones (ADR-0030 §4).
ALTER TABLE "aceptaciones_de_identidad" ADD CONSTRAINT "aceptaciones_de_identidad_identidad_id_fkey"
  FOREIGN KEY ("identidad_id") REFERENCES "identidades" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
COMMENT ON TABLE "aceptaciones_de_identidad" IS
  'Global (excepciones_rls). Qué documento legal de ViajaPro aceptó una identidad, en qué versión y por qué canal. Solo SELECT e INSERT para viajapro_identidad: es evidencia. ADR-0030 §4.';

-- 4.2 El código de registro por correo (ADR-0030 §3.7). Una sola fila viva por correo, por la base.
CREATE TABLE "codigos_de_registro" (
    "id"                 UUID           NOT NULL,
    "correo_hmac"        BYTEA          NOT NULL,
    "hash_codigo"        BYTEA          NOT NULL,
    "intentos_restantes" SMALLINT       NOT NULL,
    "expira_en"          TIMESTAMPTZ(3) NOT NULL,
    "creado_en"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigos_de_registro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "codigos_de_registro_intentos_no_negativos" CHECK ("intentos_restantes" >= 0),
    -- HMAC-SHA256 y SHA-256: 32 bytes. Otra longitud es un correo o un código en claro por error.
    CONSTRAINT "codigos_de_registro_correo_hmac_32" CHECK (octet_length("correo_hmac") = 32),
    CONSTRAINT "codigos_de_registro_hash_codigo_32" CHECK (octet_length("hash_codigo") = 32)
);
CREATE UNIQUE INDEX "codigos_de_registro_correo_hmac_key" ON "codigos_de_registro" ("correo_hmac");
COMMENT ON TABLE "codigos_de_registro" IS
  'Global (excepciones_rls), solo viajapro_identidad. Código de registro por correo: HMAC del correo (único), SHA-256 del código, intentos que se consumen ANTES de comparar. ADR-0030 §3.7.';

-- 4.3 El código de acceso del piloto (ADR-0030 §3.8). Lo crea la plataforma (T-280).
CREATE TABLE "codigos_de_acceso_al_registro" (
    "hash"                   BYTEA          NOT NULL,
    "expira_en"              TIMESTAMPTZ(3) NOT NULL,
    "usado_en"               TIMESTAMPTZ(3),
    "usado_por_identidad_id" UUID,
    "correo_hmac"            BYTEA          NOT NULL,
    "creado_en"              TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nota"                   VARCHAR(200),

    CONSTRAINT "codigos_de_acceso_al_registro_pkey" PRIMARY KEY ("hash"),
    CONSTRAINT "codigos_de_acceso_al_registro_hash_32" CHECK (octet_length("hash") = 32),
    CONSTRAINT "codigos_de_acceso_al_registro_correo_hmac_32" CHECK (octet_length("correo_hmac") = 32),
    -- Usado = cuándo Y por quién. Uno sin el otro no es representable.
    CONSTRAINT "codigos_de_acceso_al_registro_uso_completo"
      CHECK (("usado_en" IS NULL) = ("usado_por_identidad_id" IS NULL))
);
COMMENT ON TABLE "codigos_de_acceso_al_registro" IS
  'Global (excepciones_rls), NINGÚN rol de login. Código de acceso del piloto: SHA-256 del secreto (>=128 bits), atado al HMAC de un correo, de un solo uso. Lo consume crear_agencia; lo comprueba codigo_de_acceso_vigente. ADR-0030 §3.8.';
COMMENT ON COLUMN "codigos_de_acceso_al_registro"."nota" IS
  'Para la plataforma (para qué agencia piloto es). SIN datos personales.';

-- 4.4 El tope global de altas por hora (ADR-0030 §3.2). Una sola fila; ningún rol de login la escribe.
CREATE TABLE "parametros_del_registro" (
    "id"             SMALLINT       NOT NULL DEFAULT 1,
    "tope_por_hora"  INTEGER        NOT NULL,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_del_registro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "parametros_del_registro_fila_unica" CHECK ("id" = 1),
    CONSTRAINT "parametros_del_registro_tope_por_hora" CHECK ("tope_por_hora" BETWEEN 1 AND 1000)
);
INSERT INTO "parametros_del_registro" ("id", "tope_por_hora") VALUES (1, 30);
COMMENT ON TABLE "parametros_del_registro" IS
  'Global (excepciones_rls), una fila. tope_por_hora: cortocircuito de crear_agencia (VPR02), no un límite de negocio. Solo la escribe la plataforma. ADR-0030 §3.2.';

-- -----------------------------------------------------------------------------
-- 5. `perfiles_de_agencia`: la EXTIENDE (la creó 20261120130000, T-261, con `rnt` y `verificado_en`)
--
-- El NIT no va en `tenants`: esa tabla la leen enteros tres roles de login, y el NIT de una persona
-- natural es su cédula (ADR-0030 §3.3). Lo que declara el registrante NO está verificado.
--
-- La tabla, su RLS (USING + WITH CHECK), su declaración en `privilegios_declarados` (solo
-- `viajapro_app`: SELECT, INSERT, UPDATE) y su disparador ya existen y no se recrean. Aquí:
--   · tres columnas nulables (sin reescritura): `nit`, `digito_verificacion`, `razon_social`, en
--     TEXT/SMALLINT con CHECK, como `rnt`;
--   · el aviso de 20261120130000 a T-268: `proteger_verificacion_del_perfil` se REEMPLAZA (CREATE OR
--     REPLACE, mismo nombre y mismo disparador) para que cambiar el NIT, o su dígito de verificación,
--     anule `verificado_en` igual que cambiar el RNT. Si solo se añadiera la columna, una agencia con
--     NIT verificado podría cambiarlo por el de otra y conservar la verificación.
--   · `perfiles_de_agencia_verificado_exige_rnt` SIGUE siendo la regla: la plataforma verifica NIT y
--     RNT a la vez (T-280), y toda agencia de turismo en Colombia tiene RNT. Un NIT verificado sin RNT
--     no es un estado que T-280 vaya a producir; si llegara a serlo, es una migración nueva.
-- -----------------------------------------------------------------------------
ALTER TABLE "perfiles_de_agencia"
  ADD COLUMN "nit"                 TEXT,
  ADD COLUMN "digito_verificacion" SMALLINT,
  ADD COLUMN "razon_social"        TEXT;

-- Sin el DV, solo dígitos. El formato exacto de la DIAN no está verificado aquí: 1 a 15 dígitos.
ALTER TABLE "perfiles_de_agencia" ADD CONSTRAINT "perfiles_de_agencia_nit_formato"
  CHECK ("nit" IS NULL OR "nit" ~ '^[0-9]{1,15}$');
-- El DV es un dígito, y solo existe junto a un NIT.
ALTER TABLE "perfiles_de_agencia" ADD CONSTRAINT "perfiles_de_agencia_digito_verificacion"
  CHECK ("digito_verificacion" IS NULL
         OR ("digito_verificacion" BETWEEN 0 AND 9 AND "nit" IS NOT NULL));
ALTER TABLE "perfiles_de_agencia" ADD CONSTRAINT "perfiles_de_agencia_razon_social_longitud"
  CHECK ("razon_social" IS NULL OR length(btrim("razon_social")) BETWEEN 1 AND 200);

COMMENT ON TABLE "perfiles_de_agencia" IS
  'Datos legales de la agencia (T-261 y T-268, ADR-0030 §3.3): RNT, NIT, DV y razón social. Una fila por agencia. Lo que declara la agencia no está verificado: solo la plataforma fija verificado_en (disparador proteger_verificacion_del_perfil). Ningún documento al viajero imprime NIT ni RNT sin verificado_en.';
COMMENT ON COLUMN "perfiles_de_agencia"."nit" IS
  'NIT que declara la agencia, sin el dígito de verificación: solo dígitos. Puede ser la cédula de una persona natural: en claro bajo RLS por ADR-0030 («Negativas»). Cambiarlo anula verificado_en.';
COMMENT ON COLUMN "perfiles_de_agencia"."verificado_en" IS
  'UTC. Lo fija la plataforma tras comprobar NIT y RNT; NULL = sin verificar. Cambiar el NIT, el DV o el RNT lo devuelve a NULL.';

-- El disparador, REEMPLAZADO. Mismas reglas que el de T-261, que prueban P-1 a P-6, ampliadas del
-- RNT a los tres datos que la plataforma verifica (`nit`, `digito_verificacion`, `rnt`):
--   - Quien NO es la plataforma (todo rol de aplicación): al insertar, `verificado_en` queda NULL; al
--     actualizar, si cambia un dato verificado queda NULL, y si no queda como estaba (no puede fijarlo
--     ni borrarlo por su cuenta).
--   - La plataforma (el dueño de la tabla, o quien tenga su USAGE): puede fijarlo; pero si cambia un
--     dato verificado sin tocar `verificado_en`, queda NULL (un dato nuevo no hereda la verificación).
-- `razon_social` no anula la verificación: ADR-0030 §3.3 nombra solo NIT y RNT.
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
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  v_dato_cambiado := NEW.rnt IS DISTINCT FROM OLD.rnt
                  OR NEW.nit IS DISTINCT FROM OLD.nit
                  OR NEW.digito_verificacion IS DISTINCT FROM OLD.digito_verificacion;

  IF NOT v_plataforma THEN
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
  'Disparador BEFORE INSERT OR UPDATE de perfiles_de_agencia (T-261, ampliado en T-268): solo la plataforma (el dueno de la tabla) fija o conserva un verificado_en no nulo; cambiar el rnt, el nit o el digito_verificacion lo anula. SECURITY INVOKER, search_path vacio.';

-- CREATE OR REPLACE conserva el ACL, pero se repite: el cinturón lo comprueba.
REVOKE ALL ON FUNCTION proteger_verificacion_del_perfil() FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 6. Privilegios de los roles de login: lo declarado en el paso 1, por el ÚNICO mecanismo
-- -----------------------------------------------------------------------------
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 7. La superficie de `viajapro_registro`: columnas, no tablas (ADR-0030 §3.1)
--
-- `tenants`: lee lo que usan VPR01 (creado_por_identidad_id, origen_del_alta, estado), VPR02
-- (origen_del_alta, creado_en), el ON CONFLICT (slug) y el RETURNING id; inserta las columnas de la
-- fila nueva (`creado_en` toma su DEFAULT). NINGÚN UPDATE, DELETE ni TRUNCATE sobre `tenants`.
-- `codigos_de_acceso_al_registro`: lee lo que filtra el UPDATE y escribe solo el uso.
-- -----------------------------------------------------------------------------
GRANT SELECT ("id", "slug", "estado", "origen_del_alta", "creado_por_identidad_id", "creado_en")
  ON TABLE public.tenants TO viajapro_registro;
GRANT INSERT ("id", "slug", "nombre", "pais_iso", "moneda_iso", "zona_horaria", "estado",
              "origen_del_alta", "creado_por_identidad_id", "prueba_termina_en",
              "encargo_version", "encargo_aceptado_en", "actualizado_en")
  ON TABLE public.tenants TO viajapro_registro;
GRANT SELECT ("codigo_iso") ON TABLE public.monedas TO viajapro_registro;
GRANT SELECT ("hash", "usado_en", "expira_en", "correo_hmac")
  ON TABLE public.codigos_de_acceso_al_registro TO viajapro_registro;
GRANT UPDATE ("usado_en", "usado_por_identidad_id")
  ON TABLE public.codigos_de_acceso_al_registro TO viajapro_registro;
GRANT SELECT ("tope_por_hora") ON TABLE public.parametros_del_registro TO viajapro_registro;

-- -----------------------------------------------------------------------------
-- 8. Las dos funciones, creadas por su dueño
--
-- Las reglas de las SECURITY DEFINER (ADR-0008 §1.4 y 20261007120300 §7): search_path vacío y todo
-- cualificado, sin SQL dinámico, volatilidad declarada y REVOKE a PUBLIC inmediatamente después, por
-- su dueño. `crear_agencia` no es STRICT a propósito (ADR-0027): un NULL da 22023 (o VPR04), nunca un
-- NULL silencioso que la API tomaría por un id.
--
-- **Sin bloques EXCEPTION en `crear_agencia`.** Revertir una subtransacción revertiría también el
-- `set_config` hecho dentro (supuesto S1), y un EXCEPTION alrededor del INSERT sería la tentación de
-- convertir un choque de slug en otra cosa. El choque se resuelve con ON CONFLICT (slug) DO NOTHING.
--
-- **Solo `SET search_path = ''`.** Una cláusula `SET app.current_tenant` restauraría el valor del
-- llamador al volver y rompería S1 en silencio: el cinturón exige `proconfig = {search_path=""}`.
-- Un `set_config(..., true)` dentro del cuerpo SÍ sobrevive al volver: PostgreSQL solo restaura, al
-- salir de la función, los parámetros que ella misma declara con SET.
--
-- Lógica de tres valores, explícita: cada comprobación está escrita para que un NULL caiga del lado
-- del error (`IS NULL OR`, `COALESCE(..., false)`), nunca del lado del éxito.
-- -----------------------------------------------------------------------------
-- Poseer un objeto nuevo exige CREATE sobre el esquema. Se presta y se retira (cinturón).
GRANT CREATE ON SCHEMA public TO viajapro_registro;

SET ROLE viajapro_registro;

CREATE FUNCTION public.crear_agencia(
  p_nombre text,
  p_slug_base text,
  p_pais_iso text,
  p_moneda_iso text,
  p_zona_horaria text,
  p_identidad_id uuid,
  p_dias_de_prueba integer,
  p_version_encargo text,
  p_hash_codigo_de_acceso bytea,
  p_correo_hmac bytea)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  -- La lista vive en la función (ADR-0030 §3.2). Los prefijos viajapro-* y soporte-* llegan con T-291.
  c_slugs_reservados constant text[] := ARRAY[
    'admin', 'api', 'app', 'www', 'soporte', 'ayuda', 'viajapro', 'plataforma', 'demo',
    'agencia-demo', 'registro', 'ingresar'];
  -- Candado de DOS claves: espacio propio del registro + hash de la identidad. Los espacios 7410100
  -- y 7410101 son de los disparadores del directorio (20261020010000); los candados de una sola
  -- clave bigint de la API y de las pruebas viven en otro espacio de PostgreSQL.
  c_espacio_del_registro constant integer := 7410102;
  c_intentos_con_sufijo  constant integer := 5;
  v_contexto   text := pg_catalog.current_setting('app.current_tenant', true);
  v_nombre     text := pg_catalog.btrim(p_nombre);
  v_version    text := pg_catalog.btrim(p_version_encargo);
  v_tope       integer;
  v_recientes  bigint;
  v_filas      bigint;
  v_id         uuid;
  v_slug       text;
  v_creada     uuid;
  v_intento    integer;
BEGIN
  -- 1. Precondición de contexto: no se ejecuta dentro de una transacción que ya trabaja para una
  --    agencia (no le cambia el contexto a mitad de camino). NULL = el GUC no existe; '' = vacío.
  IF v_contexto IS NOT NULL AND v_contexto <> '' THEN
    RAISE EXCEPTION 'contexto_de_tenant_no_vacio: crear_agencia exige app.current_tenant vacío'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validación (22023). Nada se escribe ni se bloquea antes de esto.
  IF v_nombre IS NULL OR pg_catalog.length(v_nombre) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'nombre_invalido: el nombre debe tener de 2 a 200 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_slug_base ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                  AND pg_catalog.length(p_slug_base) BETWEEN 3 AND 50, false) THEN
    RAISE EXCEPTION 'slug_invalido: minúsculas, dígitos y guiones simples, de 3 a 50 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_pais_iso ~ '^[A-Z]{2}$', false) THEN
    RAISE EXCEPTION 'pais_invalido: código ISO 3166-1 alfa-2 en mayúsculas'
      USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_moneda_iso ~ '^[A-Z]{3}$', false)
     OR NOT EXISTS (SELECT 1 FROM public.monedas m WHERE m.codigo_iso = p_moneda_iso) THEN
    RAISE EXCEPTION 'moneda_invalida: la moneda no está habilitada'
      USING ERRCODE = '22023';
  END IF;
  -- La zona, con las mismas exclusiones que actualizar_zona_horaria_de_la_agencia (ADR-0027).
  IF p_zona_horaria IS NULL
     OR pg_catalog.length(p_zona_horaria) > 64
     OR p_zona_horaria LIKE 'posix/%'
     OR p_zona_horaria LIKE 'right/%'
     OR p_zona_horaria IN ('localtime', 'posixrules', 'Factory')
     OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names t WHERE t.name = p_zona_horaria) THEN
    RAISE EXCEPTION 'zona_horaria_invalida: no es una zona horaria IANA reconocida'
      USING ERRCODE = '22023';
  END IF;
  IF p_dias_de_prueba IS NULL OR p_dias_de_prueba NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'dias_de_prueba_invalidos: de 1 a 60'
      USING ERRCODE = '22023';
  END IF;
  IF v_version IS NULL OR pg_catalog.length(v_version) NOT BETWEEN 1 AND 40 THEN
    RAISE EXCEPTION 'version_de_encargo_invalida: no puede estar vacía ni pasar de 40 caracteres'
      USING ERRCODE = '22023';
  END IF;
  IF p_identidad_id IS NULL THEN
    RAISE EXCEPTION 'identidad_invalida: la identidad es obligatoria'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Una agencia en prueba de autoservicio por identidad (VPR01), bajo candado: dos altas
  --    simultáneas de la misma identidad se serializan aquí.
  PERFORM pg_catalog.pg_advisory_xact_lock(c_espacio_del_registro,
                                           pg_catalog.hashtext(p_identidad_id::text));
  IF EXISTS (
    SELECT 1
      FROM public.tenants t
     WHERE t.creado_por_identidad_id = p_identidad_id
       AND t.origen_del_alta = 'AUTOSERVICIO'::public.origen_del_alta
       AND t.estado = 'EN_PRUEBA'::public.estado_tenant
  ) THEN
    RAISE EXCEPTION 'agencia_en_prueba_existente: esta identidad ya tiene una agencia en prueba'
      USING ERRCODE = 'VPR01';
  END IF;

  -- 4. El código de acceso, consumido de forma atómica (VPR04, sin distinguir la causa). La fila
  --    queda bloqueada hasta el final de la transacción: un alta simultánea con el mismo código
  --    espera aquí y, al reevaluar, ya no lo encuentra sin usar. Un ROLLBACK posterior lo devuelve.
  UPDATE public.codigos_de_acceso_al_registro c
     SET usado_en               = pg_catalog.now(),
         usado_por_identidad_id = p_identidad_id
   WHERE c.hash = p_hash_codigo_de_acceso
     AND c.usado_en IS NULL
     AND c.expira_en > pg_catalog.now()
     AND c.correo_hmac = p_correo_hmac;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas <> 1 THEN
    RAISE EXCEPTION 'codigo_de_acceso_invalido: el código de acceso no es válido'
      USING ERRCODE = 'VPR04';
  END IF;

  -- 5. Tope global por hora (VPR02). Cortocircuito ante un bucle o un ataque. Sin fila de
  --    parámetros, cerrado: también VPR02.
  SELECT p.tope_por_hora INTO v_tope FROM public.parametros_del_registro p;
  IF v_tope IS NULL THEN
    RAISE EXCEPTION 'registro_saturado: parametros_del_registro no tiene su fila'
      USING ERRCODE = 'VPR02';
  END IF;
  SELECT pg_catalog.count(*) INTO v_recientes
    FROM public.tenants t
   WHERE t.origen_del_alta = 'AUTOSERVICIO'::public.origen_del_alta
     AND t.creado_en > pg_catalog.now() - interval '1 hour';
  IF v_recientes >= v_tope THEN
    RAISE EXCEPTION 'registro_saturado: se alcanzó el tope de altas por hora'
      USING ERRCODE = 'VPR02';
  END IF;

  -- 6. La fila NUEVA. El id lo elige la base (v4: PostgreSQL 16 no trae v7, y en `tenants` el orden
  --    del índice no importa). Slug base, salvo que sea reservado; si choca (o era reservado), base
  --    + '-' + 4 hex aleatorios, hasta 5 intentos. INSERT ... ON CONFLICT (slug) DO NOTHING: ante
  --    un choque no se toca la fila que ya existe; se prueba otro slug.
  v_id := pg_catalog.gen_random_uuid();
  FOR v_intento IN 0 .. c_intentos_con_sufijo LOOP
    IF v_intento = 0 THEN
      CONTINUE WHEN p_slug_base = ANY (c_slugs_reservados);
      v_slug := p_slug_base;
    ELSE
      v_slug := p_slug_base || '-'
                || pg_catalog.substr(pg_catalog.gen_random_uuid()::text, 1, 4);
    END IF;

    INSERT INTO public.tenants (
      id, slug, nombre, pais_iso, moneda_iso, zona_horaria, estado, origen_del_alta,
      creado_por_identidad_id, prueba_termina_en, encargo_version, encargo_aceptado_en,
      actualizado_en)
    VALUES (
      v_id, v_slug, v_nombre, p_pais_iso, p_moneda_iso, p_zona_horaria,
      'EN_PRUEBA'::public.estado_tenant, 'AUTOSERVICIO'::public.origen_del_alta,
      p_identidad_id,
      pg_catalog.now() + pg_catalog.make_interval(days => p_dias_de_prueba),
      v_version, pg_catalog.now(), pg_catalog.now())
    ON CONFLICT (slug) DO NOTHING
    RETURNING id INTO v_creada;

    EXIT WHEN v_creada IS NOT NULL;
  END LOOP;

  IF v_creada IS NULL THEN
    RAISE EXCEPTION 'slug_sin_hueco: no se encontró un slug libre'
      USING ERRCODE = 'VPR03';
  END IF;

  -- 7. El contexto de la agencia nueva. ÚLTIMA sentencia antes del RETURN y fuera de todo bloque
  --    EXCEPTION (S1): la transacción del llamador queda atada a ESTA agencia.
  PERFORM pg_catalog.set_config('app.current_tenant', v_creada::text, true);
  RETURN v_creada;
END;
$func$;

REVOKE ALL ON FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea) TO viajapro_app;
COMMENT ON FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea) IS
  'ADR-0030 §3.2: crea UNA agencia nueva (EN_PRUEBA, AUTOSERVICIO), consume el código de acceso y deja app.current_tenant fijado a ella. Solo inserta; el id lo elige la base. Errores: 22023, 42501 contexto_de_tenant_no_vacio, VPR01, VPR02, VPR03, VPR04. Decimosexta función SECURITY DEFINER; EXECUTE solo para viajapro_app.';

CREATE FUNCTION public.codigo_de_acceso_vigente(p_hash bytea, p_correo_hmac bytea)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
  -- Solo lee. Exige el correo: no hay rama para un código sin correo. Un NULL da false.
  SELECT EXISTS (
    SELECT 1
      FROM public.codigos_de_acceso_al_registro c
     WHERE c.hash = p_hash
       AND c.correo_hmac = p_correo_hmac
       AND c.usado_en IS NULL
       AND c.expira_en > pg_catalog.now()
  );
$func$;

REVOKE ALL ON FUNCTION public.codigo_de_acceso_vigente(bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.codigo_de_acceso_vigente(bytea, bytea) TO viajapro_app;
COMMENT ON FUNCTION public.codigo_de_acceso_vigente(bytea, bytea) IS
  'ADR-0030 §3.8: ¿hay un código de acceso sin usar, vigente y atado a ese correo? Sin consumirlo y sin decir por qué no. STABLE, solo lectura. Decimoséptima función SECURITY DEFINER; EXECUTE solo para viajapro_app.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_registro;

-- -----------------------------------------------------------------------------
-- 9. Cinturón: lo que esta migración dice haber hecho, comprobado
--
-- Las mismas aserciones, y las de comportamiento, están en `tests/aislamiento.spec.ts` («T-268 —
-- Registro de agencias»), más las 10, 11, 12, 13, 14, 20 y 22/23, que pasan a 17 funciones y 7
-- propietarios.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  f record;
  v_rol text;
  v_tabla text;
  v_privilegio text;
  defectos text;
  superficie text[];
  esperada text[];
  propias text[];
  concedidas text[];
  miembro_de text[];
  reales text[];
  esperados text[];
BEGIN
  -- ---- El rol -------------------------------------------------------------------------------
  SELECT rolcanlogin, rolbypassrls, rolsuper, rolinherit, rolcreatedb, rolcreaterole INTO r
    FROM pg_roles WHERE rolname = 'viajapro_registro';
  IF r.rolcanlogin OR r.rolbypassrls OR r.rolsuper OR r.rolinherit OR r.rolcreatedb OR r.rolcreaterole THEN
    RAISE EXCEPTION 'viajapro_registro puede iniciar sesión, saltarse RLS, heredar o crear: un propietario no es una credencial.';
  END IF;
  IF has_schema_privilege('viajapro_registro', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'viajapro_registro conserva CREATE sobre public.';
  END IF;

  -- El rol de migraciones se lo PONE y no lo hereda (PostgreSQL ≥ 16: set_option / inherit_option).
  IF NOT EXISTS (SELECT 1 FROM pg_auth_members m
                  WHERE m.roleid = 'viajapro_registro'::regrole
                    AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                    AND m.set_option) THEN
    RAISE EXCEPTION 'El rol de migraciones (%) no puede ponerse viajapro_registro (SET TRUE).', current_user;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_auth_members m
              WHERE m.roleid = 'viajapro_registro'::regrole
                AND m.member = (SELECT oid FROM pg_roles WHERE rolname = current_user)
                AND m.inherit_option) THEN
    RAISE EXCEPTION 'El rol de migraciones (%) HEREDA viajapro_registro: debe ser INHERIT FALSE.', current_user;
  END IF;

  -- ---- Superficie EXACTA de columnas (ADR-0030 §3.1) -------------------------------------------
  -- Privilegios efectivos que no le vienen de PUBLIC, en todo esquema que no sea del sistema. Mismo
  -- idioma que 20261116090000 y 20261118090100; ordenado en "C" para no depender de la intercalación.
  esperada := ARRAY(SELECT x FROM unnest(ARRAY[
    'public.codigos_de_acceso_al_registro.correo_hmac:SELECT',
    'public.codigos_de_acceso_al_registro.expira_en:SELECT',
    'public.codigos_de_acceso_al_registro.hash:SELECT',
    'public.codigos_de_acceso_al_registro.usado_en:SELECT',
    'public.codigos_de_acceso_al_registro.usado_en:UPDATE',
    'public.codigos_de_acceso_al_registro.usado_por_identidad_id:UPDATE',
    'public.monedas.codigo_iso:SELECT',
    'public.parametros_del_registro.tope_por_hora:SELECT',
    'public.tenants.actualizado_en:INSERT',
    'public.tenants.creado_en:SELECT',
    'public.tenants.creado_por_identidad_id:INSERT',
    'public.tenants.creado_por_identidad_id:SELECT',
    'public.tenants.encargo_aceptado_en:INSERT',
    'public.tenants.encargo_version:INSERT',
    'public.tenants.estado:INSERT',
    'public.tenants.estado:SELECT',
    'public.tenants.id:INSERT',
    'public.tenants.id:SELECT',
    'public.tenants.moneda_iso:INSERT',
    'public.tenants.nombre:INSERT',
    'public.tenants.origen_del_alta:INSERT',
    'public.tenants.origen_del_alta:SELECT',
    'public.tenants.pais_iso:INSERT',
    'public.tenants.prueba_termina_en:INSERT',
    'public.tenants.slug:INSERT',
    'public.tenants.slug:SELECT',
    'public.tenants.zona_horaria:INSERT'
  ]) AS e(x) ORDER BY x COLLATE "C");

  SELECT array_agg(format('%s.%s.%s:%s', n.nspname, c.relname, a.attname, p.priv)
                   ORDER BY format('%s.%s.%s:%s', n.nspname, c.relname, a.attname, p.priv) COLLATE "C")
    INTO superficie
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
   CROSS JOIN unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) AS p(priv)
   WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
     AND n.nspname NOT LIKE 'pg\_toast%'
     AND n.nspname NOT LIKE 'pg\_temp%'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND has_column_privilege('viajapro_registro', c.oid, a.attnum, p.priv)
     AND NOT has_column_privilege('public', c.oid, a.attnum, p.priv);
  IF superficie IS DISTINCT FROM esperada THEN
    RAISE EXCEPTION 'La superficie de viajapro_registro no es la declarada en ADR-0030 §3.1: %', superficie;
  END IF;

  -- Ni un privilegio de TABLA (daría también las columnas de mañana, y DELETE o TRUNCATE).
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x
              WHERE x.grantee = 'viajapro_registro'::regrole) THEN
    RAISE EXCEPTION 'viajapro_registro tiene un privilegio de tabla: su superficie son columnas.';
  END IF;
  FOREACH v_privilegio IN ARRAY ARRAY['UPDATE', 'DELETE', 'TRUNCATE'] LOOP
    IF has_table_privilege('viajapro_registro', 'public.tenants', v_privilegio) THEN
      RAISE EXCEPTION 'viajapro_registro tiene % sobre tenants.', v_privilegio;
    END IF;
  END LOOP;
  IF has_any_column_privilege('viajapro_registro', 'public.tenants', 'UPDATE') THEN
    RAISE EXCEPTION 'viajapro_registro puede actualizar columnas de tenants: solo inserta.';
  END IF;

  -- No es miembro de ningún rol, y ningún rol de login de aplicación puede actuar como él.
  SELECT array_agg(m.roleid::regrole::text ORDER BY m.roleid::regrole::text) INTO miembro_de
    FROM pg_auth_members m WHERE m.member = 'viajapro_registro'::regrole;
  IF miembro_de IS NOT NULL THEN
    RAISE EXCEPTION 'viajapro_registro es miembro de: %', miembro_de;
  END IF;
  IF EXISTS (SELECT 1 FROM roles_de_login_vigilados v
              WHERE pg_has_role(v.rolname, 'viajapro_registro', 'MEMBER')) THEN
    RAISE EXCEPTION 'Un rol de login de aplicación puede actuar como viajapro_registro.';
  END IF;
  FOREACH v_rol IN ARRAY ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad'] LOOP
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_rol);
    IF pg_has_role(v_rol, 'viajapro_registro', 'MEMBER') THEN
      RAISE EXCEPTION '% puede actuar como viajapro_registro.', v_rol;
    END IF;
  END LOOP;

  -- Dueño EXACTAMENTE de las dos funciones, y nadie le concede EXECUTE sobre otra.
  SELECT array_agg(format('%s.%s', n.nspname, p.proname)
                   ORDER BY format('%s.%s', n.nspname, p.proname) COLLATE "C")
    INTO propias
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proowner = 'viajapro_registro'::regrole;
  IF propias IS DISTINCT FROM ARRAY['public.codigo_de_acceso_vigente', 'public.crear_agencia'] THEN
    RAISE EXCEPTION 'viajapro_registro debe ser dueño solo de codigo_de_acceso_vigente y crear_agencia; lo es de: %', propias;
  END IF;
  SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text)
    INTO concedidas
    FROM pg_proc p, aclexplode(p.proacl) x
   WHERE x.grantee = 'viajapro_registro'::regrole
     AND p.proowner <> x.grantee;
  IF concedidas IS NOT NULL THEN
    RAISE EXCEPTION 'Funciones que conceden EXECUTE a viajapro_registro: %', concedidas;
  END IF;

  -- ---- Las dos funciones ------------------------------------------------------------------------
  FOR f IN
    SELECT p.oid, p.proname, p.prosecdef, p.proconfig, p.provolatile, p.proisstrict, p.prosrc,
           l.lanname AS lenguaje,
           pg_get_function_identity_arguments(p.oid) AS argumentos,
           pg_get_function_result(p.oid) AS resultado
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
     WHERE n.nspname = 'public' AND p.proname IN ('crear_agencia', 'codigo_de_acceso_vigente')
  LOOP
    IF NOT f.prosecdef THEN
      RAISE EXCEPTION '% no es SECURITY DEFINER.', f.proname;
    END IF;
    -- EXACTAMENTE {search_path=""}: ni otro valor, ni una segunda cláusula SET (una de
    -- app.current_tenant restauraría el contexto al volver y rompería S1 en silencio).
    IF f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
      RAISE EXCEPTION 'El proconfig de % no es exactamente {search_path=""}: %', f.proname, f.proconfig;
    END IF;
    IF f.proisstrict THEN
      RAISE EXCEPTION '% es STRICT: un NULL daría un NULL silencioso.', f.proname;
    END IF;
    -- Sin SQL dinámico.
    IF f.prosrc ~* '\mEXECUTE\M' OR f.prosrc ~* '\mformat\s*\(' THEN
      RAISE EXCEPTION '% contiene SQL dinámico.', f.proname;
    END IF;

    IF f.proname = 'crear_agencia' THEN
      IF f.provolatile <> 'v' OR f.lenguaje <> 'plpgsql' THEN
        RAISE EXCEPTION 'crear_agencia debe ser plpgsql VOLATILE (es %, %).', f.lenguaje, f.provolatile;
      END IF;
      IF f.argumentos IS DISTINCT FROM
           'p_nombre text, p_slug_base text, p_pais_iso text, p_moneda_iso text, p_zona_horaria text, p_identidad_id uuid, p_dias_de_prueba integer, p_version_encargo text, p_hash_codigo_de_acceso bytea, p_correo_hmac bytea'
         OR f.resultado IS DISTINCT FROM 'uuid' THEN
        RAISE EXCEPTION 'crear_agencia no tiene la firma de ADR-0030 §3.2: (%) -> %', f.argumentos, f.resultado;
      END IF;
      -- Sin bloques EXCEPTION (S1) y sin DO UPDATE: el único ON CONFLICT es DO NOTHING por slug.
      IF f.prosrc ~* '\mEXCEPTION\s+WHEN\M' THEN
        RAISE EXCEPTION 'crear_agencia tiene un bloque EXCEPTION: revertiría el set_config (S1).';
      END IF;
      IF f.prosrc ~* '\mDO\s+UPDATE\M' OR f.prosrc !~* 'ON\s+CONFLICT\s*\(\s*slug\s*\)\s*DO\s+NOTHING' THEN
        RAISE EXCEPTION 'crear_agencia debe usar ON CONFLICT (slug) DO NOTHING y nunca DO UPDATE.';
      END IF;
      IF f.prosrc !~* 'pg_advisory_xact_lock\s*\(\s*c_espacio_del_registro\s*,' THEN
        RAISE EXCEPTION 'crear_agencia debe tomar el candado de DOS claves (espacio del registro, identidad).';
      END IF;
      IF f.prosrc !~* 'gen_random_uuid\s*\(\s*\)' THEN
        RAISE EXCEPTION 'crear_agencia debe generar el id con gen_random_uuid().';
      END IF;
    ELSE
      IF f.provolatile <> 's' THEN
        RAISE EXCEPTION 'codigo_de_acceso_vigente debe ser STABLE (provolatile = s); es %.', f.provolatile;
      END IF;
      IF f.argumentos IS DISTINCT FROM 'p_hash bytea, p_correo_hmac bytea'
         OR f.resultado IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'codigo_de_acceso_vigente no tiene la firma de ADR-0030 §3.8: (%) -> %', f.argumentos, f.resultado;
      END IF;
      -- Solo lectura.
      IF f.prosrc ~* '\m(INSERT|UPDATE|DELETE|TRUNCATE|set_config)\M' THEN
        RAISE EXCEPTION 'codigo_de_acceso_vigente escribe algo: debe ser solo lectura.';
      END IF;
    END IF;

    -- EXECUTE: PUBLIC no; `viajapro_app` sí; el resto de roles de login, no.
    IF has_function_privilege('public', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC puede ejecutar %.', f.proname;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app')
       AND NOT has_function_privilege('viajapro_app', f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'viajapro_app no puede ejecutar %.', f.proname;
    END IF;
    FOR v_rol IN
      SELECT rolname FROM roles_de_login_vigilados
      UNION
      SELECT rolname FROM pg_roles WHERE rolname IN ('viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
    LOOP
      CONTINUE WHEN v_rol = 'viajapro_app';
      IF has_function_privilege(v_rol, f.oid, 'EXECUTE') THEN
        RAISE EXCEPTION '% puede ejecutar %: solo la API.', v_rol, f.proname;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname IN ('crear_agencia', 'codigo_de_acceso_vigente')) <> 2 THEN
    RAISE EXCEPTION 'Tiene que haber exactamente una firma de crear_agencia y una de codigo_de_acceso_vigente.';
  END IF;

  -- ---- Lo que NO cambia: `viajapro_app` sigue sin escribir `tenants` ----------------------------
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

  -- ---- Las cuatro tablas globales: sin tenant_id, declaradas, y privilegios = declaración ----------
  FOREACH v_tabla IN ARRAY ARRAY['aceptaciones_de_identidad', 'codigos_de_registro',
                                 'codigos_de_acceso_al_registro', 'parametros_del_registro'] LOOP
    IF EXISTS (SELECT 1 FROM pg_attribute a
                WHERE a.attrelid = format('public.%I', v_tabla)::regclass
                  AND a.attname LIKE 'tenant%' AND a.attnum > 0 AND NOT a.attisdropped) THEN
      RAISE EXCEPTION '% tiene una columna tenant%%: el aplicador le pondría RLS.', v_tabla;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM excepciones_rls e WHERE e.tabla = v_tabla) THEN
      RAISE EXCEPTION '% no está declarada en excepciones_rls.', v_tabla;
    END IF;
    FOR v_rol IN
      SELECT rolname FROM roles_de_login_vigilados
      UNION
      SELECT rolname FROM pg_roles
       WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
    LOOP
      SELECT COALESCE(array_agg(p ORDER BY p COLLATE "C"), '{}')
        INTO reales
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
       WHERE has_table_privilege(v_rol, format('public.%I', v_tabla)::regclass, p);
      esperados := CASE
        WHEN v_tabla = 'aceptaciones_de_identidad' AND v_rol = 'viajapro_identidad'
          THEN ARRAY['INSERT', 'SELECT']
        WHEN v_tabla = 'codigos_de_registro' AND v_rol = 'viajapro_identidad'
          THEN ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']
        ELSE '{}'::text[] END;
      IF reales IS DISTINCT FROM esperados THEN
        RAISE EXCEPTION 'Privilegios de % sobre %: % (se esperaba %).', v_rol, v_tabla, reales, esperados;
      END IF;
      IF esperados = '{}'::text[]
         AND (has_any_column_privilege(v_rol, format('public.%I', v_tabla)::regclass, 'SELECT')
              OR has_any_column_privilege(v_rol, format('public.%I', v_tabla)::regclass, 'INSERT')
              OR has_any_column_privilege(v_rol, format('public.%I', v_tabla)::regclass, 'UPDATE')) THEN
        RAISE EXCEPTION '% tiene privilegios de columna sobre %.', v_rol, v_tabla;
      END IF;
    END LOOP;
  END LOOP;
  IF (SELECT count(*) FROM public.parametros_del_registro) <> 1 THEN
    RAISE EXCEPTION 'parametros_del_registro debe tener exactamente una fila.';
  END IF;
  IF NOT (SELECT a.attnotnull FROM pg_attribute a
           WHERE a.attrelid = 'public.codigos_de_acceso_al_registro'::regclass
             AND a.attname = 'correo_hmac' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'codigos_de_acceso_al_registro.correo_hmac admite nulos: no hay códigos sin correo.';
  END IF;

  -- ---- `tenants.origen_del_alta`: NOT NULL DEFAULT 'PLATAFORMA' ------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
      JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attrelid = 'public.tenants'::regclass AND a.attname = 'origen_del_alta'
       AND a.attnotnull AND NOT a.attisdropped
       AND pg_get_expr(d.adbin, d.adrelid) LIKE '''PLATAFORMA''::%'
  ) THEN
    RAISE EXCEPTION 'tenants.origen_del_alta no es NOT NULL DEFAULT ''PLATAFORMA''.';
  END IF;

  -- ---- `perfiles_de_agencia`: de agencia, aislada, y el disparador armado -------------------------
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.perfiles_de_agencia'::regclass) THEN
    RAISE EXCEPTION 'perfiles_de_agencia no tiene RLS habilitada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p
                  WHERE p.polrelid = 'public.perfiles_de_agencia'::regclass
                    AND p.polname = 'tenant_isolation'
                    AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) THEN
    RAISE EXCEPTION 'perfiles_de_agencia no tiene la política tenant_isolation con USING y WITH CHECK.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'perfiles_de_agencia') THEN
    RAISE EXCEPTION 'perfiles_de_agencia no puede ser una excepción de RLS.';
  END IF;
  -- UN solo disparador de usuario, el de T-261, con la función reemplazada.
  IF (SELECT count(*) FROM pg_trigger t
       WHERE t.tgrelid = 'public.perfiles_de_agencia'::regclass AND NOT t.tgisinternal) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM pg_trigger t
        WHERE t.tgrelid = 'public.perfiles_de_agencia'::regclass
          AND t.tgname = 'perfiles_de_agencia_proteger_verificacion'
          AND NOT t.tgisinternal AND t.tgenabled = 'O'
          AND t.tgfoid = 'public.proteger_verificacion_del_perfil()'::regprocedure
          AND pg_get_triggerdef(t.oid) ~ 'BEFORE INSERT OR UPDATE ON (public\.)?perfiles_de_agencia FOR EACH ROW'
     ) THEN
    RAISE EXCEPTION 'perfiles_de_agencia debe tener solo perfiles_de_agencia_proteger_verificacion, BEFORE INSERT OR UPDATE por fila y habilitado.';
  END IF;
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
  -- El aviso de T-261, cumplido: el cuerpo compara también el NIT y su DV.
  IF (SELECT p.prosrc FROM pg_proc p
       WHERE p.oid = 'public.proteger_verificacion_del_perfil()'::regprocedure)
     !~ 'NEW\.nit IS DISTINCT FROM OLD\.nit'
     OR (SELECT p.prosrc FROM pg_proc p
          WHERE p.oid = 'public.proteger_verificacion_del_perfil()'::regprocedure)
     !~ 'NEW\.digito_verificacion IS DISTINCT FROM OLD\.digito_verificacion' THEN
    RAISE EXCEPTION 'proteger_verificacion_del_perfil no compara nit y digito_verificacion: el aviso de 20261120130000 sigue sin cumplirse.';
  END IF;
  -- Las tres columnas nuevas existen y son nulables; los CHECK de T-261 siguen.
  IF (SELECT count(*) FROM pg_attribute a
       WHERE a.attrelid = 'public.perfiles_de_agencia'::regclass
         AND a.attname IN ('nit', 'digito_verificacion', 'razon_social')
         AND NOT a.attnotnull AND NOT a.attisdropped) <> 3 THEN
    RAISE EXCEPTION 'perfiles_de_agencia no tiene nit, digito_verificacion y razon_social nulables.';
  END IF;
  IF (SELECT count(*) FROM pg_constraint c
       WHERE c.conrelid = 'public.perfiles_de_agencia'::regclass AND c.contype = 'c' AND c.convalidated
         AND c.conname IN ('perfiles_de_agencia_rnt_formato', 'perfiles_de_agencia_verificado_exige_rnt',
                           'perfiles_de_agencia_nit_formato', 'perfiles_de_agencia_digito_verificacion',
                           'perfiles_de_agencia_razon_social_longitud')) <> 5 THEN
    RAISE EXCEPTION 'Faltan (o no están validados) los CHECK de perfiles_de_agencia.';
  END IF;
  -- Los privilegios de la tabla no cambian: solo viajapro_app, SELECT, INSERT y UPDATE (T-261).
  IF NOT EXISTS (SELECT 1 FROM privilegios_declarados d
                  WHERE d.tabla = 'perfiles_de_agencia' AND d.rol = 'viajapro_app'
                    AND d.privilegios = ARRAY['SELECT','INSERT','UPDATE']::text[])
     OR (SELECT count(*) FROM privilegios_declarados d WHERE d.tabla = 'perfiles_de_agencia') <> 1 THEN
    RAISE EXCEPTION 'La declaración de perfiles_de_agencia dejó de ser solo viajapro_app {SELECT,INSERT,UPDATE}.';
  END IF;
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    SELECT COALESCE(array_agg(p ORDER BY p COLLATE "C"), '{}')
      INTO reales
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
     WHERE has_table_privilege(v_rol, 'public.perfiles_de_agencia', p);
    esperados := CASE WHEN v_rol = 'viajapro_app'
                      THEN ARRAY['INSERT', 'SELECT', 'UPDATE'] ELSE '{}'::text[] END;
    IF reales IS DISTINCT FROM esperados THEN
      RAISE EXCEPTION 'Privilegios de % sobre perfiles_de_agencia: % (se esperaba %).', v_rol, reales, esperados;
    END IF;
  END LOOP;
END;
$$;
