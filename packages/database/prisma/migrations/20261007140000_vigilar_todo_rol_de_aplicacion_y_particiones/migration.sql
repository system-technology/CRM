-- Corrige el mecanismo de privilegios y el aplicador de RLS.
-- Generada desde policies/001-aislamiento-tenant.sql, tras la auditoría de implementación
-- de ADR-0008 (docs/_auditorias/2026-10-07-implementacion-adr-0008.md).
--
-- Tres cambios, el primero es un hallazgo CRÍTICO:
--   1. `roles_de_login_vigilados` excluía `rolcreaterole` y `rolcreatedb`. Como la
--      CONCESIÓN no sale de esa vista sino del literal `roles_de_aplicacion`, bastaba un
--      `ALTER ROLE viajapro_app CREATEDB` para que siguiera recibiendo DML sobre todo y
--      dejara de revocársele nada sobre las cuatro tablas globales. Ahora se excluye lo
--      mínimo, el rol de migraciones se exceptúa por identidad, y la función LANZA si un
--      rol de aplicación no está vigilado.
--   2. El `RESET ROLE` del bucle era código muerto: la función retornaba con el rol
--      puesto hasta el fin de la transacción.
--   3. `aplicar_aislamiento_tenant` y `tablas_sin_aislamiento` ignoraban las particiones.
--      Inocuo mientras la única particionada sea global; una fuga completa el día que se
--      particione `mensajes`.

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
DECLARE
  particion record;
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

  -- Y baja a las particiones, una por una.
  --
  -- PostgreSQL **no** hereda la configuración de RLS del padre: una consulta que ataque
  -- la partición directamente usa la suya, que nadie habilitó. Mientras la única tabla
  -- particionada sea global esto no cambia nada; el día que se particione `mensajes`
  -- —que es inevitable— sería una fuga completa entre agencias sin un solo error. Se
  -- hace ahora, que es barato, y no el día que haga falta.
  FOR particion IN
    SELECT c.relname AS tabla
    FROM pg_inherits h
    JOIN pg_class c ON c.oid = h.inhrelid
    JOIN pg_class padre ON padre.oid = h.inhparent
    JOIN pg_namespace n ON n.oid = padre.relnamespace
    WHERE n.nspname = 'public' AND padre.relname = nombre_tabla
  LOOP
    PERFORM aplicar_aislamiento_tenant(particion.tabla);
  END LOOP;
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
WITH RECURSIVE raices AS (
  -- Una partición no se juzga por su nombre sino por el de su tabla raíz: es la raíz la
  -- que está declarada —o no— en `excepciones_rls`. Sin esto, excluir las particiones
  -- dejaba fuera de vigilancia a la mitad del esquema el día que se particione una tabla
  -- de negocio, e incluirlas a secas marcaría como defecto las particiones del historial.
  SELECT c.oid, c.relname AS raiz
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relispartition
  UNION ALL
  SELECT h.inhrelid, r.raiz
  FROM pg_inherits h
  JOIN raices r ON r.oid = h.inhparent
)
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
FROM raices r
JOIN pg_class c ON c.oid = r.oid
WHERE
  -- Excepciones declaradas, en datos y no en un literal. Cada una con su motivo.
  NOT EXISTS (SELECT 1 FROM excepciones_rls e WHERE e.tabla = r.raiz);

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
-- Se excluye **lo mínimo**, y aquí hubo un error que costó una auditoría: la primera
-- versión excluía también `rolcreaterole` y `rolcreatedb`, y eso convertía un atributo
-- inocuo en un interruptor de apagado. La **concesión** no sale de esta vista —sale del
-- literal `roles_de_aplicacion` de abajo—, así que un simple
-- `ALTER ROLE viajapro_app CREATEDB` lo dejaba fuera de la vigilancia mientras seguía
-- recibiendo `GRANT ... ON ALL TABLES`: nadie volvía a revocarle nada sobre las cuatro
-- tablas globales y seis aserciones dejaban de preguntar por él. Es el mismo crítico de
-- siempre girado sobre el otro eje: **lo que sale de la lista nace desprotegido.**
--
-- Lo que queda fuera, y por qué:
--   · `rolsuper` y `rolbypassrls`: a esos no los arregla ningún `REVOKE`. Un rol que se
--     salta RLS es el problema de ADR-0007, no el de este archivo, y lo cubre el guardia
--     de arranque de la aplicación. En Neon entran aquí `cloud_admin`, `neon_service` y
--     el propio rol propietario.
--   · `pg_%`: roles predefinidos del motor, que no inician sesión de verdad.
--   · **El rol de migraciones, por identidad y no por atributo**: es el dueño de
--     `_prisma_migrations`, es quien concede y quien traspasa propiedad, y vigilarlo
--     sería exigirle que no pueda hacer su trabajo. `IS DISTINCT FROM` y no `<>` a
--     propósito: si esa tabla no existiera, la comparación con NULL vaciaría la vista
--     entera y todas las aserciones se volverían huecas sin quedar en rojo.
--
-- `CREATEDB` y `CREATEROLE` son ortogonales a «esto es un rol de aplicación», y a esos
-- sí los arregla un `REVOKE`. Por eso ahora se vigilan.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW roles_de_login_vigilados AS
SELECT r.rolname
FROM pg_roles r
WHERE r.rolcanlogin
  AND NOT r.rolsuper
  AND NOT r.rolbypassrls
  AND r.rolname NOT LIKE 'pg\_%'
  AND r.rolname IS DISTINCT FROM (
    SELECT pg_get_userbyid(c.relowner)
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = '_prisma_migrations'
  );

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
  -- El rol con el que se entró, que NO es `current_user` una vez dentro del bucle.
  rol_sesion CONSTANT text := session_user;
BEGIN
  -- Guardia: concesión y vigilancia tienen que hablar del mismo conjunto.
  --
  -- Si un rol de aplicación recibe el GRANT general pero se queda fuera de
  -- `roles_de_login_vigilados`, nadie le revoca nada sobre las tablas globales y las
  -- aserciones dejan de preguntar por él. No hay forma de que eso produzca un error por
  -- sí solo, así que el error se produce aquí, a propósito, y detiene la migración.
  FOREACH rol_app IN ARRAY roles_de_aplicacion LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app)
       AND NOT EXISTS (SELECT 1 FROM roles_de_login_vigilados WHERE rolname = rol_app) THEN
      RAISE EXCEPTION
        'El rol de aplicación % existe pero no está vigilado: recibiría privilegios que nadie revoca. Revisa sus atributos (¿SUPERUSER, BYPASSRLS?).',
        rol_app;
    END IF;
  END LOOP;
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
      --
      -- Se compara contra `session_user` y no contra `current_user`: dentro del bucle,
      -- después del primer `SET LOCAL ROLE`, `current_user` **es** el dueño, de modo que
      -- la condición de volver atrás era siempre falsa y la función retornaba con el rol
      -- puesto hasta el fin de la transacción. Hoy era inocuo de casualidad; la próxima
      -- sentencia que alguien añadiera después de la llamada se habría ejecutado como
      -- `viajapro_enrutador`.
      IF objetivo.dueno <> rol_sesion THEN
        EXECUTE format('SET LOCAL ROLE %I', objetivo.dueno);
      END IF;

      EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', objetivo.nombre, fila.rol);
      IF lista <> '' THEN
        EXECUTE format('GRANT %s ON TABLE %s TO %I', lista, objetivo.nombre, fila.rol);
      END IF;

      -- Incondicional: volver al rol de sesión no tiene coste y no depende de que la
      -- condición de arriba siga siendo correcta dentro de seis meses.
      EXECUTE 'RESET ROLE';
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION aplicar_privilegios_declarados() IS
  'Concede a los roles de aplicación y revoca lo declarado en excepciones_rls, en el mismo bloque. ADR-0008 §1.2.';

REVOKE ALL ON FUNCTION aplicar_privilegios_declarados() FROM PUBLIC;
REVOKE ALL ON FUNCTION aplicar_aislamiento_tenant(text) FROM PUBLIC;

SELECT aplicar_privilegios_declarados();
