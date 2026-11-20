-- =============================================================================
-- ADR-0031, PR 1 (carril datos) — el apodo de ingreso, en la pertenencia y en su índice
--
-- El apodo es un dato de la PERTENENCIA (`usuarios.apodo`): lo fija la agencia con
-- `viajapro_app`, bajo RLS. El disparador que ya mantiene `accesos_identidad` lo copia al índice
-- global, que es lo único que el pool de identidad (`viajapro_identidad`) puede leer sin tenant.
-- No hay roles, funciones ni privilegios nuevos: cambian dos tablas, el cuerpo de
-- `sincronizar_acceso_identidad()` y la lista de columnas de su disparador.
--
-- Qué hace, en orden:
--   0. Comprueba que ninguna identidad tiene un correo del dominio `.invalid` (ni de un
--      subdominio suyo). Si alguna lo tiene, ABORTA sin tocar nada: ver §4.
--   1. `usuarios.apodo`: `text NULL`, CHECK de formato y longitud (3..30) y
--      `UNIQUE (tenant_id, apodo)`, que es ya la unicidad de la fase 2.
--   2. `accesos_identidad.apodo`: `text NULL`, el mismo CHECK y `UNIQUE (apodo)` GLOBAL. Es la
--      fase 1: con una sola agencia en uso (ADR-0031 §4, precondición dura B3).
--   3. `sincronizar_acceso_identidad()` con el cuerpo nuevo, creada bajo
--      `SET ROLE viajapro_accesos` (el dueño se conserva) y su disparador, rehecho para escuchar
--      también `apodo`. Las condiciones del ADR, una por una, están junto al cuerpo.
--   4. `identidades.correo` rechaza el dominio `.invalid` y sus subdominios: el ingreso por apodo
--      usa un correo CENTINELA de ese dominio (`x@viajapro.invalid`) para que un apodo
--      inexistente recorra el mismo camino que uno real. Si esa identidad pudiera existir, con
--      una contraseña conocida abriría sesión con cualquier apodo inexistente.
--   5. Cinturón: lo dicho, comprobado contra el catálogo.
--
-- **El apodo es dato personal** (se deriva del nombre de la persona): no se imprime en ningún
-- mensaje de esta migración ni en los de sus comprobaciones.
--
-- **Relleno:** ninguno. El apodo de toda fila existente nace NULL (sin apodo se entra por correo,
-- como hasta hoy) y el índice queda coherente: NULL en las dos tablas.
--
-- **Segura en caliente.** `ADD COLUMN` nulable y sin DEFAULT es solo de catálogo. Los CHECK y los
-- índices únicos recorren `usuarios`, `accesos_identidad` e `identidades`, que tienen un puñado
-- de filas (cientos previstos), dentro de la transacción en la que Prisma corre el archivo. El
-- CHECK de `identidades.correo` va NOT VALID + VALIDATE por costumbre, no por tamaño.
-- `DROP TRIGGER` + `CREATE TRIGGER` van en la misma transacción: no hay instante sin disparador.
--
-- **REVERSIBLE** con una migración nueva (la API tiene que dejar de leer y escribir el apodo
-- antes; ningún dato de negocio depende de él):
--   rehacer `sincronizar_acceso_identidad()` con el cuerpo de 20261019230000 (bajo
--   `SET ROLE viajapro_accesos`, con el mismo préstamo de CREATE y de EXECUTE que aquí) y su
--   disparador con `UPDATE OF identidad_id, tenant_id, activo, eliminado_en`;
--   ALTER TABLE accesos_identidad DROP COLUMN apodo;   -- se lleva su CHECK y su índice
--   ALTER TABLE usuarios DROP COLUMN apodo;            -- ídem
--   ALTER TABLE identidades DROP CONSTRAINT identidades_correo_sin_dominio_invalid;
-- Se pierden los apodos asignados, que la agencia puede volver a fijar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Antes de nada: ninguna identidad con correo del dominio `.invalid`
--
-- El VALIDATE del §4 fallaría igual, pero con un mensaje que no dice qué hacer. Aquí se cuenta
-- (sin imprimir ningún correo) y se distingue el residuo de pruebas, que tiene arreglo conocido.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  v_total   bigint;
  v_fixture bigint;
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE i.correo::text LIKE 'fixture-aislamiento-%')
    INTO v_total, v_fixture
    FROM public.identidades i
   WHERE i.correo::text ~* '[@.]invalid\.?[[:space:]]*$';
  IF v_total > 0 THEN
    RAISE EXCEPTION 'Hay % identidades con correo del dominio .invalid (% son residuo de pruebas con el prefijo fixture-aislamiento-). El correo centinela del ingreso por apodo (ADR-0031 §4) no puede existir como identidad. El residuo de pruebas se borra con scripts/limpiar-fixtures.mjs; las demás las decide el propietario antes de reintentar.',
      v_total, v_fixture;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. `usuarios.apodo`, el dato
--
-- Solo minúsculas ASCII, dígitos y `.`, `_` o `-` entre alfanuméricos; empieza por letra; de 3 a
-- 30. La unicidad sin distinguir mayúsculas sale POR CONSTRUCCIÓN (no hay mayúsculas), sin
-- `citext`. La normalización (recortar, NFKC, minúsculas) y los reservados viven en
-- `packages/contracts` (PR 2): la base solo garantiza la forma.
-- -----------------------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN "apodo" TEXT;
ALTER TABLE public.usuarios ADD CONSTRAINT "usuarios_apodo_formato"
  CHECK ("apodo" ~ '^[a-z][a-z0-9]*([._-][a-z0-9]+)*$' AND length("apodo") BETWEEN 3 AND 30);
CREATE UNIQUE INDEX "usuarios_tenant_id_apodo_key" ON public.usuarios ("tenant_id", "apodo");
COMMENT ON COLUMN public.usuarios.apodo IS
  'Apodo de ingreso (ADR-0031). Opcional. Lo fija quien tiene usuarios.administrar, bajo RLS. Único por agencia; el disparador sincronizar_acceso_identidad lo copia a accesos_identidad. Dato personal: no se imprime en logs, auditoría ni eventos.';

-- -----------------------------------------------------------------------------
-- 2. `accesos_identidad.apodo`, su reflejo en el índice global
--
-- `UNIQUE (apodo)` GLOBAL: fase 1, una sola agencia. La fase 2 (T-361) lo cambia por
-- `UNIQUE (tenant_acceso_id, apodo)` sin mover datos. La API traduce el 23505 por el NOMBRE de
-- este índice (`accesos_identidad_apodo_key`) a `409 APODO_NO_DISPONIBLE`: no cambiarlo sin
-- cambiar la API.
--
-- Sin privilegios nuevos: `viajapro_accesos` conserva SELECT, INSERT y DELETE de tabla (la
-- columna nueva queda cubierta), ni UPDATE. `viajapro_identidad` conserva SELECT de tabla, que
-- es justo lo que el ingreso necesita para resolver el apodo (la cola de ADR-0031, C6, lo estrecha a columnas).
-- -----------------------------------------------------------------------------
ALTER TABLE public.accesos_identidad ADD COLUMN "apodo" TEXT;
ALTER TABLE public.accesos_identidad ADD CONSTRAINT "accesos_identidad_apodo_formato"
  CHECK ("apodo" ~ '^[a-z][a-z0-9]*([._-][a-z0-9]+)*$' AND length("apodo") BETWEEN 3 AND 30);
CREATE UNIQUE INDEX "accesos_identidad_apodo_key" ON public.accesos_identidad ("apodo");
COMMENT ON COLUMN public.accesos_identidad.apodo IS
  'Copia de usuarios.apodo que escribe solo el disparador sincronizar_acceso_identidad. Único en todo el sistema mientras dure la fase 1 de ADR-0031. Índice, no autoridad: resolverlo no concede nada sin la contraseña y el paso 4 bajo RLS.';

-- -----------------------------------------------------------------------------
-- 3. El disparador de `accesos_identidad`, con el apodo
--
-- Condiciones de ADR-0031 (tabla «Plan por PR», fila 1), y dónde se cumplen:
--   · Al insertar copia NEW.apodo: el INSERT lleva la columna.
--   · Si en un UPDATE cambia el apodo, BORRA EL PAR DE NEW y lo inserta de nuevo con el apodo
--     nuevo: sin UPDATE, «un par se pone o se quita». La rama va condicionada con
--     `OLD.apodo IS DISTINCT FROM NEW.apodo` (NULL → valor y valor → NULL cuentan) y va FUERA de
--     las marcas `[par-old]`: la expresión de M17 en `scripts/mutaciones-aislamiento.mjs` es
--     codiciosa y quita todo lo que haya entre la primera marca y la última. Tiene sus propias
--     marcas, que quita la mutación M21.
--   · TODOS los DELETE van antes del INSERT: un par con el apodo viejo nunca coexiste con el
--     nuevo, y la colisión que pueda haber es solo la de otra pertenencia.
--   · `ON CONFLICT (identidad_id, tenant_acceso_id) DO NOTHING`, CON columnas: el de antes, sin
--     columnas, también absorbía la violación de `UNIQUE (apodo)`, y un apodo ajeno se habría
--     quedado fuera del índice en silencio. Así un apodo repetido en otra agencia da 23505 y
--     REVIERTE el cambio en `usuarios`: no queda una pertenencia sin su fila en el índice.
--   · El DELETE de la baja física se conserva: sin él, borrar un `usuarios` dejaría el par y su
--     apodo en el índice.
--   · Desactivar o borrar lógicamente quita el par (y con él el apodo), como hasta hoy.
--
-- Lo que no cambia: lo dispara quien escribe `usuarios` (viajapro_app, bajo RLS), así que NEW ya
-- pasó el WITH CHECK de su agencia y la función solo puede apuntar el par de una pertenencia
-- legítima. SECURITY DEFINER, search_path vacío y todo cualificado, sin SQL dinámico, VOLATILE,
-- sin EXECUTE para nadie (PostgreSQL no lo comprueba al disparar, solo al crear el disparador).
--
-- Reemplazar exige CREATE sobre el esquema y ser el dueño: se presta CREATE a
-- `viajapro_accesos`, se crea con su rol y se retira (como en 20261020010000). CREATE OR
-- REPLACE conserva dueño y ACL; el REVOKE se repite igual, por si acaso.
-- -----------------------------------------------------------------------------
GRANT CREATE ON SCHEMA public TO viajapro_accesos;

SET ROLE viajapro_accesos;

CREATE OR REPLACE FUNCTION public.sincronizar_acceso_identidad()
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

  -- [rama-apodo]
  IF TG_OP = 'UPDATE' THEN
    IF OLD.apodo IS DISTINCT FROM NEW.apodo THEN
      DELETE FROM public.accesos_identidad
       WHERE identidad_id = NEW.identidad_id AND tenant_acceso_id = NEW.tenant_id;
    END IF;
  END IF;
  -- [/rama-apodo]

  IF NEW.activo IS NOT TRUE OR NEW.eliminado_en IS NOT NULL THEN
    DELETE FROM public.accesos_identidad
     WHERE identidad_id = NEW.identidad_id AND tenant_acceso_id = NEW.tenant_id;
    RETURN NULL;
  END IF;

  INSERT INTO public.accesos_identidad (identidad_id, tenant_acceso_id, apodo)
  VALUES (NEW.identidad_id, NEW.tenant_id, NEW.apodo)
  ON CONFLICT (identidad_id, tenant_acceso_id) DO NOTHING;

  RETURN NULL;
END;
$func$;

REVOKE ALL ON FUNCTION public.sincronizar_acceso_identidad() FROM PUBLIC;
COMMENT ON FUNCTION public.sincronizar_acceso_identidad() IS
  'Mantiene accesos_identidad desde usuarios: alta, baja, desactivación, repunte (borra el par OLD) y cambio de apodo (borra el par NEW y lo vuelve a poner). Un apodo repetido en otra agencia da 23505 y revierte el cambio. ADR-0011 y ADR-0031.';

-- Crear el disparador exige EXECUTE sobre su función, y el rol de migraciones no lo tiene sobre
-- una función de `viajapro_accesos` (en Neon no es superusuario). Lo presta el dueño, aquí, y lo
-- retira en cuanto existe el disparador. `session_user` y no `current_user`: con el rol puesto,
-- `current_user` es el propio dueño.
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.sincronizar_acceso_identidad() TO %I', session_user);
END;
$$;

RESET ROLE;

DROP TRIGGER usuarios_sincronizar_acceso_identidad ON public.usuarios;
CREATE TRIGGER usuarios_sincronizar_acceso_identidad
  AFTER INSERT OR DELETE OR UPDATE OF identidad_id, tenant_id, activo, eliminado_en, apodo
  ON public.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_acceso_identidad();

SET ROLE viajapro_accesos;
DO $$
BEGIN
  EXECUTE format('REVOKE EXECUTE ON FUNCTION public.sincronizar_acceso_identidad() FROM %I', session_user);
END;
$$;
RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_accesos;

-- -----------------------------------------------------------------------------
-- 4. `identidades.correo` no admite el dominio `.invalid` ni sus subdominios
--
-- `.invalid` es el TLD reservado para nombres que no pueden existir (RFC 2606, RFC 6761). El
-- correo centinela del ingreso vive ahí, y esta restricción garantiza que nadie —ni una
-- invitación, ni el registro, ni un script— pueda crear una identidad con ese correo o con otro
-- del mismo dominio. Sin distinguir mayúsculas, con o sin punto final y con o sin espacios al
-- final: `x@VIAJAPRO.INVALID.` también queda fuera. El contrato (PR 2) lo rechaza antes, con un
-- mensaje; esto es la garantía.
-- -----------------------------------------------------------------------------
ALTER TABLE public.identidades ADD CONSTRAINT "identidades_correo_sin_dominio_invalid"
  CHECK ("correo"::text !~* '[@.]invalid\.?[[:space:]]*$') NOT VALID;
ALTER TABLE public.identidades VALIDATE CONSTRAINT "identidades_correo_sin_dominio_invalid";

-- -----------------------------------------------------------------------------
-- 5. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
--
-- Las mismas aserciones, de comportamiento, están en `tests/aislamiento.spec.ts` (AP1 a AP12).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos     text;
  v_rol        text;
  v_priv       text;
  v_fuente     text;
  v_marcas     text;
  v_pos        integer;
  v_ultimo_del integer;
  f            record;
  reales       text[];
  superficie   text[];
  columnas     text[];
BEGIN
  -- Nada quedó sin aislamiento, y `usuarios` sigue con su RLS forzada y su política.
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.usuarios'::regclass) THEN
    RAISE EXCEPTION 'usuarios no tiene RLS habilitada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p
                  WHERE p.polrelid = 'public.usuarios'::regclass
                    AND p.polname = 'tenant_isolation'
                    AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) THEN
    RAISE EXCEPTION 'usuarios no tiene la política tenant_isolation con USING y WITH CHECK.';
  END IF;

  -- `accesos_identidad` sigue siendo global: sin `tenant_id` (el aplicador de `001` le pondría
  -- RLS y el ingreso, que corre sin tenant, vería cero filas) y declarada en excepciones_rls.
  IF EXISTS (SELECT 1 FROM pg_attribute a
              WHERE a.attrelid = 'public.accesos_identidad'::regclass
                AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'accesos_identidad tiene una columna tenant_id.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'accesos_identidad') THEN
    RAISE EXCEPTION 'accesos_identidad dejó de estar declarada en excepciones_rls.';
  END IF;

  -- Las dos columnas: text y nulables.
  IF (SELECT count(*) FROM pg_attribute a
       WHERE a.attrelid IN ('public.usuarios'::regclass, 'public.accesos_identidad'::regclass)
         AND a.attname = 'apodo' AND NOT a.attisdropped AND NOT a.attnotnull
         AND a.atttypid = 'text'::regtype) <> 2 THEN
    RAISE EXCEPTION 'usuarios.apodo y accesos_identidad.apodo deben existir, ser text y nulables.';
  END IF;

  -- Los tres CHECK, presentes y VALIDADOS.
  IF (SELECT count(*) FROM pg_constraint c
       WHERE c.contype = 'c' AND c.convalidated
         AND ((c.conrelid = 'public.usuarios'::regclass
               AND c.conname = 'usuarios_apodo_formato')
           OR (c.conrelid = 'public.accesos_identidad'::regclass
               AND c.conname = 'accesos_identidad_apodo_formato')
           OR (c.conrelid = 'public.identidades'::regclass
               AND c.conname = 'identidades_correo_sin_dominio_invalid'))) <> 3 THEN
    RAISE EXCEPTION 'Faltan (o no están validados) los CHECK del apodo y de identidades.correo.';
  END IF;

  -- Las dos unicidades, por COLUMNAS y no por nombre de índice: usuarios (tenant_id, apodo) y
  -- accesos_identidad (apodo) a secas. Únicas, válidas, sin predicado ni expresiones.
  SELECT array_agg(a.attname::text ORDER BY k.n)
    INTO columnas
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
   WHERE i.indexrelid = 'public.usuarios_tenant_id_apodo_key'::regclass
     AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL;
  IF columnas IS DISTINCT FROM ARRAY['tenant_id', 'apodo'] THEN
    RAISE EXCEPTION 'usuarios_tenant_id_apodo_key no es UNIQUE (tenant_id, apodo): %', columnas;
  END IF;
  SELECT array_agg(a.attname::text ORDER BY k.n)
    INTO columnas
    FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)
    JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
   WHERE i.indexrelid = 'public.accesos_identidad_apodo_key'::regclass
     AND i.indisunique AND i.indisvalid AND i.indpred IS NULL AND i.indexprs IS NULL;
  IF columnas IS DISTINCT FROM ARRAY['apodo'] THEN
    RAISE EXCEPTION 'accesos_identidad_apodo_key no es UNIQUE (apodo): %', columnas;
  END IF;

  -- El disparador: UNO solo sobre usuarios que llame a la función, habilitado, AFTER, por fila,
  -- en INSERT, DELETE y UPDATE OF exactamente las cinco columnas. tgtype = ROW(1) | INSERT(4) |
  -- DELETE(8) | UPDATE(16) = 29, sin BEFORE(2), TRUNCATE(32) ni INSTEAD(64).
  IF (SELECT count(*) FROM pg_trigger t
       WHERE t.tgrelid = 'public.usuarios'::regclass AND NOT t.tgisinternal
         AND t.tgfoid = 'public.sincronizar_acceso_identidad()'::regprocedure) <> 1 THEN
    RAISE EXCEPTION 'usuarios debe tener exactamente un disparador sobre sincronizar_acceso_identidad.';
  END IF;
  SELECT t.tgname, t.tgenabled, t.tgtype, t.tgqual,
         (SELECT array_agg(a.attname::text ORDER BY a.attname)
            FROM pg_attribute a
           WHERE a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr::int2[])) AS escucha
    INTO f
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.usuarios'::regclass AND NOT t.tgisinternal
     AND t.tgfoid = 'public.sincronizar_acceso_identidad()'::regprocedure;
  IF f.tgname <> 'usuarios_sincronizar_acceso_identidad' OR f.tgenabled <> 'O'
     OR f.tgtype <> 29 OR f.tgqual IS NOT NULL THEN
    RAISE EXCEPTION 'El disparador de accesos_identidad no es AFTER INSERT OR DELETE OR UPDATE por fila, habilitado y sin WHEN (nombre %, estado %, tipo %).',
      f.tgname, f.tgenabled, f.tgtype;
  END IF;
  IF f.escucha IS DISTINCT FROM ARRAY['activo', 'apodo', 'eliminado_en', 'identidad_id', 'tenant_id'] THEN
    RAISE EXCEPTION 'El disparador de accesos_identidad escucha UPDATE OF % (se esperaba activo, apodo, eliminado_en, identidad_id, tenant_id).',
      f.escucha;
  END IF;

  -- La función: SECURITY DEFINER, search_path VACÍO (el valor), dueño `viajapro_accesos`, una
  -- sola firma, y un ACL con SOLO la entrada del dueño: ni PUBLIC ni el préstamo al rol de
  -- migraciones, que ya se retiró. Un ACL NULL significaría el valor por defecto: PUBLIC ejecuta.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'sincronizar_acceso_identidad') <> 1 THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad debe tener una sola firma.';
  END IF;
  SELECT p.oid, p.prosecdef, p.proconfig, p.proowner, p.proacl, p.provolatile, p.prosrc
    INTO f
    FROM pg_proc p
   WHERE p.oid = 'public.sincronizar_acceso_identidad()'::regprocedure;
  IF NOT f.prosecdef THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad dejó de ser SECURITY DEFINER.';
  END IF;
  IF f.proconfig IS NULL OR NOT (f.proconfig && ARRAY['search_path=""', 'search_path=']) THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad no tiene search_path vacío: %', f.proconfig;
  END IF;
  IF f.proowner <> 'viajapro_accesos'::regrole THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad cambió de dueño: %', f.proowner::regrole;
  END IF;
  IF f.provolatile <> 'v' THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad dejó de ser VOLATILE.';
  END IF;
  IF f.proacl IS NULL
     OR EXISTS (SELECT 1 FROM aclexplode(f.proacl) x WHERE x.grantee <> f.proowner) THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad concede EXECUTE a alguien que no es su dueño: %', f.proacl;
  END IF;
  IF has_function_privilege('public', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar sincronizar_acceso_identidad.';
  END IF;
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    IF has_function_privilege(v_rol, f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar sincronizar_acceso_identidad.', v_rol;
    END IF;
  END LOOP;

  -- El cuerpo, con las condiciones del ADR. Se mira la fuente SIN comentarios.
  v_fuente := regexp_replace(f.prosrc, '--[^' || chr(10) || ']*', '', 'g');
  IF v_fuente ~* '\mEXECUTE\M' THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad no puede usar SQL dinámico.';
  END IF;
  IF v_fuente !~* 'ON\s+CONFLICT\s*\(\s*identidad_id\s*,\s*tenant_acceso_id\s*\)\s*DO\s+NOTHING'
     OR v_fuente ~* 'ON\s+CONFLICT\s+DO' THEN
    RAISE EXCEPTION 'El INSERT de sincronizar_acceso_identidad debe llevar ON CONFLICT (identidad_id, tenant_acceso_id) DO NOTHING, con columnas.';
  END IF;
  IF v_fuente ~* '\mUPDATE\s+public\.accesos_identidad' THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad no actualiza pares: los pone o los quita.';
  END IF;
  IF v_fuente !~ 'OLD\.apodo IS DISTINCT FROM NEW\.apodo' THEN
    RAISE EXCEPTION 'La rama del apodo no está condicionada con OLD.apodo IS DISTINCT FROM NEW.apodo.';
  END IF;
  IF v_fuente !~* 'TG_OP\s*=\s*''DELETE''' THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad perdió la rama del DELETE.';
  END IF;
  -- Todos los DELETE antes del (único) INSERT.
  IF (SELECT count(*) FROM regexp_matches(v_fuente, '\mINSERT\s+INTO\M', 'gi')) <> 1 THEN
    RAISE EXCEPTION 'sincronizar_acceso_identidad debe tener un solo INSERT.';
  END IF;
  v_pos := position('INSERT INTO public.accesos_identidad' IN v_fuente);
  v_ultimo_del := length(v_fuente)
                  - position(reverse('DELETE FROM public.accesos_identidad') IN reverse(v_fuente)) + 1;
  IF v_pos = 0 OR v_ultimo_del > length(v_fuente) OR v_ultimo_del > v_pos THEN
    RAISE EXCEPTION 'En sincronizar_acceso_identidad hay un DELETE después del INSERT.';
  END IF;
  -- Las marcas, en la fuente CON comentarios (son comentarios): [par-old] y [rama-apodo], cada
  -- una exactamente una vez, y la rama del apodo DESPUÉS de cerrar [par-old], así que la
  -- expresión codiciosa de M17 no la alcanza. Entre las marcas de [par-old] no se nombra apodo.
  FOREACH v_priv IN ARRAY ARRAY['[par-old]', '[/par-old]', '[rama-apodo]', '[/rama-apodo]'] LOOP
    IF (length(f.prosrc) - length(replace(f.prosrc, v_priv, ''))) / length(v_priv) <> 1 THEN
      RAISE EXCEPTION 'La marca % debe aparecer exactamente una vez en sincronizar_acceso_identidad.', v_priv;
    END IF;
  END LOOP;
  IF NOT (position('[par-old]' IN f.prosrc) < position('[/par-old]' IN f.prosrc)
          AND position('[/par-old]' IN f.prosrc) < position('[rama-apodo]' IN f.prosrc)
          AND position('[rama-apodo]' IN f.prosrc) < position('[/rama-apodo]' IN f.prosrc)) THEN
    RAISE EXCEPTION 'Las marcas de sincronizar_acceso_identidad no están en orden: la rama del apodo va después de [/par-old].';
  END IF;
  v_marcas := substring(f.prosrc FROM position('[par-old]' IN f.prosrc)
                        FOR position('[/par-old]' IN f.prosrc) - position('[par-old]' IN f.prosrc));
  IF v_marcas ~* 'apodo' THEN
    RAISE EXCEPTION 'La rama del apodo está dentro de las marcas [par-old]: M17 la borraría.';
  END IF;
  v_marcas := substring(f.prosrc FROM position('[rama-apodo]' IN f.prosrc)
                        FOR position('[/rama-apodo]' IN f.prosrc) - position('[rama-apodo]' IN f.prosrc));
  IF v_marcas !~ 'OLD\.apodo IS DISTINCT FROM NEW\.apodo'
     OR v_marcas !~ 'identidad_id = NEW\.identidad_id AND tenant_acceso_id = NEW\.tenant_id' THEN
    RAISE EXCEPTION 'Entre las marcas [rama-apodo] no está la rama del apodo que borra el par de NEW.';
  END IF;

  -- `viajapro_accesos`: el mismo propietario de siempre. NOLOGIN, sin CREATE (se le retiró),
  -- y su superficie EXACTA: SELECT, INSERT y DELETE de tabla sobre accesos_identidad, ni UPDATE
  -- (tampoco de columna: has_table_privilege no ve un GRANT de columna) ni nada en otra tabla.
  IF (SELECT rolcanlogin OR rolbypassrls OR rolsuper FROM pg_roles WHERE rolname = 'viajapro_accesos') THEN
    RAISE EXCEPTION 'viajapro_accesos puede iniciar sesión o saltarse RLS.';
  END IF;
  IF has_schema_privilege('viajapro_accesos', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'viajapro_accesos conserva CREATE sobre public.';
  END IF;
  IF EXISTS (SELECT 1 FROM roles_de_login_vigilados v
              WHERE pg_has_role(v.rolname, 'viajapro_accesos', 'MEMBER')) THEN
    RAISE EXCEPTION 'Un rol de login de aplicación puede actuar como viajapro_accesos.';
  END IF;
  SELECT COALESCE(array_agg(c.relname || ':' || p ORDER BY c.relname, p), '{}')
    INTO reales
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND has_table_privilege('viajapro_accesos', c.oid, p);
  IF reales IS DISTINCT FROM ARRAY['accesos_identidad:DELETE', 'accesos_identidad:INSERT', 'accesos_identidad:SELECT'] THEN
    RAISE EXCEPTION 'Privilegios de tabla de viajapro_accesos: % (se esperaba SELECT, INSERT y DELETE sobre accesos_identidad).', reales;
  END IF;
  IF has_any_column_privilege('viajapro_accesos', 'public.accesos_identidad', 'UPDATE') THEN
    RAISE EXCEPTION 'viajapro_accesos tiene UPDATE (de tabla o de columna) sobre accesos_identidad.';
  END IF;
  SELECT array_agg(DISTINCT c.relname::text ORDER BY c.relname::text)
    INTO superficie
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','REFERENCES']) AS p
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND c.relname <> 'accesos_identidad'
     AND has_any_column_privilege('viajapro_accesos', c.oid, p)
     AND NOT has_any_column_privilege('public', c.oid, p);
  IF superficie IS NOT NULL THEN
    RAISE EXCEPTION 'viajapro_accesos tiene privilegios de columna fuera de accesos_identidad: %', superficie;
  END IF;

  -- `viajapro_identidad` no alcanza el dato en la pertenencia: ni usuarios.apodo ni nada de
  -- usuarios, por ningún privilegio de columna. Y sobre accesos_identidad sigue solo leyendo.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_identidad') THEN
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] LOOP
      IF has_column_privilege('viajapro_identidad', 'public.usuarios', 'apodo', v_priv) THEN
        RAISE EXCEPTION 'viajapro_identidad tiene % sobre usuarios.apodo.', v_priv;
      END IF;
      IF has_any_column_privilege('viajapro_identidad', 'public.usuarios', v_priv) THEN
        RAISE EXCEPTION 'viajapro_identidad tiene % de columna sobre usuarios.', v_priv;
      END IF;
    END LOOP;
    IF NOT has_table_privilege('viajapro_identidad', 'public.accesos_identidad', 'SELECT') THEN
      RAISE EXCEPTION 'viajapro_identidad ya no puede leer accesos_identidad: el ingreso no resolvería el apodo.';
    END IF;
  END IF;

  -- Ningún rol de login escribe accesos_identidad, ni de tabla ni de columna: solo el disparador.
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege(v_rol, 'public.accesos_identidad', v_priv) THEN
        RAISE EXCEPTION '% tiene % sobre accesos_identidad.', v_rol, v_priv;
      END IF;
    END LOOP;
    IF has_any_column_privilege(v_rol, 'public.accesos_identidad', 'INSERT')
       OR has_any_column_privilege(v_rol, 'public.accesos_identidad', 'UPDATE') THEN
      RAISE EXCEPTION '% tiene INSERT o UPDATE de columna sobre accesos_identidad.', v_rol;
    END IF;
  END LOOP;
END;
$$;
