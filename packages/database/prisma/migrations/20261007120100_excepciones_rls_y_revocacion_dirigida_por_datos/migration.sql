-- Excepciones a RLS y revocación dirigida por datos.
-- Generada desde policies/001-aislamiento-tenant.sql — ADR-0008 §1.2.
--
-- Qué cambia respecto de la versión anterior de este archivo, y por qué importa:
-- hasta hoy este SQL solo CONCEDÍA (`GRANT ... ON ALL TABLES IN SCHEMA public`), y lo
-- hacía en cada regeneración de políticas. Cualquier `REVOKE` escrito en otra migración
-- se revertía solo en el siguiente despliegue, sin error y sin que ninguna prueba se
-- pusiera en rojo. Desde aquí, concesión y revocación son el mismo mecanismo y las
-- gobierna `excepciones_rls`.

-- =============================================================================
-- Aislamiento entre tenants — Row Level Security y privilegios declarados
--
-- Regla R1 y ADR-0003. Esta es la propiedad número uno del producto: que una agencia
-- vea datos de otra no es un bug, es el fin del negocio.
--
-- La diferencia esencial con filtrar en la aplicación: aquí, **olvidar el filtro no
-- produce una fuga, produce cero filas**. El fallo es seguro por defecto.
--
-- Se aplica por migración, nunca a mano.
--
-- ADR-0008 añadió la otra mitad, que antes faltaba: **la concesión y la revocación de
-- privilegios son ahora el mismo mecanismo declarativo**. Antes no lo eran, y ese era
-- un defecto crítico real, no hipotético: este archivo ejecuta
-- `GRANT ... ON ALL TABLES IN SCHEMA public` cada vez que se regenera una migración de
-- políticas —ya ocurrió dos veces en este repositorio—, de modo que cualquier `REVOKE`
-- escrito en otra migración se revertía solo, sin error, sin aviso y sin que ninguna
-- prueba se pusiera en rojo. Desde ADR-0008 el `REVOKE` vive en el mismo bloque que el
-- `GRANT` y lo gobierna `excepciones_rls`. No pueden desincronizarse.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. La declaración de excepciones
--
-- Única fuente de verdad sobre qué tablas están fuera de RLS y con qué privilegios.
-- Antes había dos listas —una en este SQL y otra en el documento de modelo de datos—
-- y ya habían divergido. La que manda es esta; el documento la refleja.
--
-- Una fila por par (tabla, rol), no una lista única: hay tres roles de login con
-- privilegios idénticos sobre las tablas de negocio, y una sola columna llamada
-- `privilegios_app` inducía a revocar para `viajapro_app` y olvidar los otros dos —
-- y el olvidado habría sido `viajapro_webhook`, el proceso que más código ejecuta
-- contra el directorio.
--
-- **Es superficie de confianza, no un catálogo inocuo.** Lo que diga esta tabla se
-- concede en el siguiente despliegue, así que se declara a sí misma con privilegios
-- vacíos y la aserción 11 fija sus tripletas contra un literal del repositorio.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "excepciones_rls" (
    "tabla" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "privilegios" TEXT[] NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "excepciones_rls_pkey" PRIMARY KEY ("tabla","rol")
);

COMMENT ON TABLE excepciones_rls IS
  'Tablas fuera de RLS y privilegios exactos por (tabla, rol). ADR-0008 §1.2. Lo que declara se aplica.';

-- Las excepciones que ya existían, más la propia tabla de control.
-- Las cuatro tablas globales del directorio y el staging se declaran en su propia
-- migración, que es la que las crea.
INSERT INTO excepciones_rls (tabla, rol, privilegios, motivo) VALUES
  ('tenants', 'viajapro_app',     '{SELECT}', 'Define los tenants: es la unidad de aislamiento y no puede estar aislada. La API solo lee; crear o dar de baja una agencia es camino de plataforma.'),
  ('tenants', 'viajapro_altas',   '{SELECT}', 'Igual que viajapro_app: el alta de un canal necesita leer el tenant, nunca escribirlo.'),
  ('tenants', 'viajapro_webhook', '{SELECT}', 'El trabajador resuelve el tenant por el directorio y necesita leer su estado.'),
  ('monedas', 'viajapro_app',     '{SELECT}', 'Dato de referencia universal, igual para todos los tenants.'),
  ('monedas', 'viajapro_altas',   '{SELECT}', 'Dato de referencia universal, igual para todos los tenants.'),
  ('monedas', 'viajapro_webhook', '{SELECT}', 'Dato de referencia universal, igual para todos los tenants.'),
  ('_prisma_migrations', 'viajapro_app',     '{}', 'Historial de migraciones de Prisma. Lo gestiona el rol propietario; la aplicación no tiene nada que hacer aquí.'),
  ('_prisma_migrations', 'viajapro_altas',   '{}', 'Historial de migraciones de Prisma. Lo gestiona el rol propietario; la aplicación no tiene nada que hacer aquí.'),
  ('_prisma_migrations', 'viajapro_webhook', '{}', 'Historial de migraciones de Prisma. Lo gestiona el rol propietario; la aplicación no tiene nada que hacer aquí.'),
  ('excepciones_rls', 'viajapro_app',     '{}', 'La declaración que gobierna este mecanismo. Escribible desde la aplicación, el remedio se convierte en el vehículo: una fila manipulada se concede sola en el siguiente despliegue.'),
  ('excepciones_rls', 'viajapro_altas',   '{}', 'La declaración que gobierna este mecanismo. Escribible desde la aplicación, el remedio se convierte en el vehículo: una fila manipulada se concede sola en el siguiente despliegue.'),
  ('excepciones_rls', 'viajapro_webhook', '{}', 'La declaración que gobierna este mecanismo. Escribible desde la aplicación, el remedio se convierte en el vehículo: una fila manipulada se concede sola en el siguiente despliegue.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

-- -----------------------------------------------------------------------------
-- 1. Aplicar la política a una tabla
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aplicar_aislamiento_tenant(nombre_tabla text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- FORCE incluye al dueño de la tabla. Sin él, el rol propietario se la salta.
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', nombre_tabla);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', nombre_tabla);

  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', nombre_tabla);

  -- NULLIF(..., '') NO es cosmético: cuando no hay contexto de tenant, current_setting
  -- devuelve CADENA VACÍA, no NULL — y ''::uuid lanza una excepción en vez de no devolver
  -- filas. Lo encontró la prueba de aislamiento contra Neon. Con NULLIF, la comparación da
  -- NULL y la consulta devuelve cero filas: el sistema se queda ciego, que es lo correcto.
  --
  -- WITH CHECK NO es opcional. Sin él, un tenant puede ESCRIBIR filas con el
  -- tenant_id de otro, aunque luego no pueda leerlas. Es el error clásico.
  EXECUTE format($politica$
    CREATE POLICY tenant_isolation ON %I
      USING      (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
      WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
  $politica$, nombre_tabla);
END;
$$;

COMMENT ON FUNCTION aplicar_aislamiento_tenant(text) IS
  'Habilita y fuerza RLS en una tabla de negocio, con política de aislamiento por tenant.';

-- -----------------------------------------------------------------------------
-- 2. Aplicarla a todas las tablas de negocio
--
-- Dirigido por datos: toda tabla que tenga una columna `tenant_id` recibe la política.
-- Así una tabla nueva queda protegida sin que nadie tenga que acordarse de añadirla
-- a una lista — y acordarse es justo lo que falla.
--
-- Y por el mismo motivo, al revés: **ninguna de las cuatro tablas globales de ADR-0008
-- tiene una columna llamada `tenant_id`**. Si alguien la añadiera "por coherencia",
-- este bucle les pondría RLS y volverían a ser ilegibles sin contexto: el ciclo
-- huevo-gallina, de vuelta, sin error y descubierto en producción. La aserción 17 lo
-- vigila; la columna del directorio se llama `tenant_resuelto_id`.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname AS tabla
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p')
      AND NOT c.relispartition
      AND a.attname = 'tenant_id'
      AND a.attnum > 0
      AND NOT a.attisdropped
  LOOP
    PERFORM aplicar_aislamiento_tenant(t.tabla);
    RAISE NOTICE 'RLS aplicada a %', t.tabla;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Detectar tablas desprotegidas
--
-- La usa la prueba de aislamiento en CI. Si devuelve filas, hay un defecto bloqueante:
-- o a una tabla de negocio le falta la política, o hay una tabla global sin declarar
-- como excepción.
--
-- Desde ADR-0008 las excepciones NO son una lista literal escrita aquí: son las filas
-- de `excepciones_rls`. Una lista literal en el SQL y otra en la documentación ya
-- habían divergido, y el ADR se apoyaba en la decorativa como mecanismo de control.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW tablas_sin_aislamiento AS
SELECT
  c.relname AS tabla,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
        AND a.attnum > 0 AND NOT a.attisdropped
    ) THEN 'sin columna tenant_id'
    WHEN NOT c.relrowsecurity  THEN 'RLS no habilitada'
    WHEN NOT c.relforcerowsecurity THEN 'RLS no forzada (el dueño se la salta)'
    WHEN NOT EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
    ) THEN 'sin política tenant_isolation'
    WHEN EXISTS (
      SELECT 1 FROM pg_policy p
      WHERE p.polrelid = c.oid AND p.polname = 'tenant_isolation'
        AND p.polwithcheck IS NULL
    ) THEN 'política sin WITH CHECK: permite escribir filas de otro tenant'
    ELSE NULL
  END AS problema
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND NOT c.relispartition
  -- Excepciones declaradas, en datos y no en un literal. Cada una con su motivo.
  AND NOT EXISTS (SELECT 1 FROM excepciones_rls e WHERE e.tabla = c.relname);

COMMENT ON VIEW tablas_sin_aislamiento IS
  'Filas = defectos de aislamiento. Debe estar vacía. La verifica la prueba de CI.';

-- -----------------------------------------------------------------------------
-- 4. Qué roles vigila este mecanismo
--
-- **Enumerados, no listados.** Una lista fija protege a los roles que alguien recordó
-- escribir: un `viajapro_reportes` creado mañana para analítica —o uno que añada el
-- proveedor gestionado— recibiría el `GRANT ... ON ALL TABLES`, no estaría declarado
-- en ninguna fila, nadie le revocaría nada y ninguna aserción preguntaría por él.
-- Lo que no está en la lista nace desprotegido.
--
-- Se excluyen por ATRIBUTO, no por nombre:
--   · `rolsuper` y `rolbypassrls`: a esos no los arregla ningún REVOKE. Un rol que se
--     salta RLS es el problema de ADR-0007, no el de este archivo, y está cubierto por
--     el guardia de arranque de la aplicación. En Neon entran aquí `cloud_admin`,
--     `neon_service` y el propio rol propietario.
--   · `rolcreaterole` / `rolcreatedb`: son roles de administración, no de aplicación.
--     El rol de las migraciones es uno de ellos y es quien concede.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW roles_de_login_vigilados AS
SELECT r.rolname
FROM pg_roles r
WHERE r.rolcanlogin
  AND NOT r.rolsuper
  AND NOT r.rolbypassrls
  AND NOT r.rolcreaterole
  AND NOT r.rolcreatedb
  AND r.rolname NOT LIKE 'pg\_%';

COMMENT ON VIEW roles_de_login_vigilados IS
  'Roles de login de aplicación, enumerados por atributo. Los usan el bucle de privilegios y las aserciones 8, 9, 10 y 20.';

-- -----------------------------------------------------------------------------
-- 5. Privilegios: concesión y revocación, en el mismo bloque
--
-- R2: la aplicación entra con roles sin BYPASSRLS. Las migraciones usan el rol
-- propietario, y solo ellas.
--
-- El orden importa y es deliberado: primero la concesión general sobre las tablas de
-- negocio, inmediatamente después la revocación declarada. Si alguna vez alguien
-- añade otro `GRANT ... ON ALL TABLES` en una migración futura —que es el idioma de
-- este repositorio—, lo que lo corrige es volver a ejecutar esta función; y si no lo
-- hace, lo detectan las aserciones 8, 9, 10, 22 y 23.
--
-- Dos sutilezas que PostgreSQL no avisa y que costaron una pasada de verificación:
--
--   (a) `ALTER TABLE ... OWNER TO` reescribe el CONCEDENTE de los permisos que ya
--       estaban en la tabla. A partir de ahí, un `REVOKE` ejecutado por el rol de
--       migraciones es un **no-op con un simple AVISO**: deja el privilegio puesto y
--       la migración termina en verde. Por eso el bucle se pone el rol del dueño de
--       cada tabla antes de tocarla.
--   (b) Las **particiones** son tablas con su propia lista de permisos. Revocar sobre
--       la tabla particionada y no sobre sus particiones deja `SELECT * FROM
--       enrutamiento_historial_2026` abierto de par en par. Por eso el bucle desciende
--       por `pg_inherits`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aplicar_privilegios_declarados()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  -- Los tres roles de login de la aplicación (ADR-0008 §1.3). Tienen privilegios
  -- IDÉNTICOS sobre las tablas de negocio y se diferencian solo en qué funciones
  -- pueden ejecutar: el rol de conexión es lo único que una inyección SQL no falsea.
  roles_de_aplicacion CONSTANT text[] := ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_webhook'];
  privilegios_validos CONSTANT text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  rol_app   text;
  fila      record;
  objetivo  record;
  privilegio text;
  lista     text;
BEGIN
  -- 5.1 Concesión general sobre todo lo que hay en el esquema.
  FOREACH rol_app IN ARRAY roles_de_aplicacion LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', rol_app);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', rol_app);
      -- Las tablas que cree una migración futura también quedan cubiertas. El FOR ROLE
      -- no es decorativo: sin él, esto solo alcanza a los objetos creados por el rol que
      -- ejecuta la sentencia, y si mañana las migraciones corrieran con otro rol la
      -- cobertura desaparecería sin un solo error.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        current_user, rol_app);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
        current_user, rol_app);
    ELSE
      RAISE NOTICE 'El rol % no existe todavía; se omiten sus GRANT.', rol_app;
    END IF;
  END LOOP;

  -- PostgreSQL concede EXECUTE a PUBLIC en toda función nueva, sin que nadie escriba
  -- un GRANT. Es el gemelo del REVOKE de tablas y es igual de silencioso.
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    current_user);

  -- 5.2 Revocación declarada, en el mismo bloque. Esto es lo que impide que lo
  -- anterior se lleve por delante el aislamiento de las tablas globales.
  -- Toda tabla declarada contra TODO rol de login vigilado. Un par sin declarar no
  -- se salta: se revoca entero. Lo que no está declarado no se concede.
  FOR fila IN
    SELECT tablas.tabla AS tabla,
           v.rolname    AS rol,
           COALESCE(e.privilegios, '{}'::text[]) AS privilegios
    FROM (SELECT DISTINCT tabla FROM excepciones_rls) tablas
    CROSS JOIN roles_de_login_vigilados v
    LEFT JOIN excepciones_rls e
           ON e.tabla = tablas.tabla AND e.rol = v.rolname
  LOOP
    -- La declaración es DATO, y el dato se valida antes de componer SQL con él.
    -- Esta tabla es superficie de confianza: una fila con basura en `privilegios`
    -- sería una inyección ejecutada con el rol que concede permisos.
    FOREACH privilegio IN ARRAY fila.privilegios LOOP
      IF NOT (privilegio = ANY (privilegios_validos)) THEN
        RAISE EXCEPTION 'excepciones_rls declara el privilegio inválido "%" para (%, %)',
          privilegio, fila.tabla, fila.rol;
      END IF;
    END LOOP;
    lista := array_to_string(fila.privilegios, ', ');

    -- La tabla declarada y todas sus particiones. Los nombres salen del catálogo,
    -- no de la declaración: aquí ya no hay entrada de usuario.
    FOR objetivo IN
      WITH RECURSIVE arbol AS (
        SELECT c.oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = fila.tabla AND c.relkind IN ('r', 'p')
        UNION ALL
        SELECT h.inhrelid
        FROM pg_inherits h
        JOIN arbol a ON a.oid = h.inhparent
      )
      SELECT a.oid::regclass::text AS nombre, pg_get_userbyid(c.relowner) AS dueno
      FROM arbol a
      JOIN pg_class c ON c.oid = a.oid
    LOOP
      -- Ver la sutileza (a) de la cabecera: sin esto el REVOKE es un no-op con aviso.
      IF objetivo.dueno <> current_user THEN
        EXECUTE format('SET LOCAL ROLE %I', objetivo.dueno);
      END IF;

      EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', objetivo.nombre, fila.rol);
      IF lista <> '' THEN
        EXECUTE format('GRANT %s ON TABLE %s TO %I', lista, objetivo.nombre, fila.rol);
      END IF;

      IF objetivo.dueno <> current_user THEN
        EXECUTE 'RESET ROLE';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION aplicar_privilegios_declarados() IS
  'Concede a los roles de aplicación y revoca lo declarado en excepciones_rls, en el mismo bloque. ADR-0008 §1.2.';

REVOKE ALL ON FUNCTION aplicar_privilegios_declarados() FROM PUBLIC;
REVOKE ALL ON FUNCTION aplicar_aislamiento_tenant(text) FROM PUBLIC;

SELECT aplicar_privilegios_declarados();
