-- =============================================================================
-- ADR-0031, PR 1b (carril datos) — `crear_agencia` no da de alta una SEGUNDA agencia mientras el
-- índice de apodos sea global
--
-- La fase 1 del ingreso por apodo deja `UNIQUE (apodo)` GLOBAL en `accesos_identidad`
-- (20261120150000). Con dos agencias, el dueño de una podría enumerar los apodos de la otra (el
-- `409` significa «existe en alguna agencia») y acaparar los predecibles. ADR-0031 §4 («Precondición
-- dura», auditoría de seguridad B3) exige que la precondición se cumpla POR CONSTRUCCIÓN en todo
-- camino de alta; esta migración es la guarda (c) en `crear_agencia`, la compuerta del PR 2 que dejó
-- la auditoría (C1). La guarda (c) de la semilla vive en `prisma/guardia-de-semilla-agencia.ts`.
--
-- Qué hace, en orden:
--   1. Reemplaza `crear_agencia` con CREATE OR REPLACE bajo `SET ROLE viajapro_registro` (el dueño se
--      conserva, y con él el ACL). Firma, SECURITY DEFINER, `search_path = ''`, VOLATILE, no STRICT,
--      sin bloques EXCEPTION, y TODOS los controles de 20261120140000 se conservan tal cual, en el
--      mismo orden. Lo único nuevo es el paso 6 del cuerpo (ver abajo), justo antes del INSERT.
--   2. Repite REVOKE a PUBLIC y GRANT EXECUTE a `viajapro_app` (idénticos a los de antes).
--   3. Cinturón: lo dicho, comprobado contra el catálogo.
--
-- **La guarda (paso 6 del cuerpo).** Si el índice de apodos es GLOBAL, la función toma un candado
-- propio de la guarda y, si `tenants` ya tiene al menos una fila, falla CERRADA con
-- `VPR05 registro_cerrado` (mensaje genérico, sin datos de ninguna agencia). Con el índice por
-- agencia la guarda se apaga sola, sin tocar esta función.
--   · **Índice global, por catálogo** (`pg_index`, `pg_attribute`, legibles por cualquier rol; nada
--     de privilegios de tabla nuevos). Es global si sobre `public.accesos_identidad` hay un índice
--     único (o de exclusión) cuyas columnas CLAVE (`indkey` hasta `indnkeyatts`, no las de INCLUDE)
--     incluyen `apodo` y no incluyen `tenant_acceso_id`; o un índice de expresión o parcial que toca
--     `apodo` (por `indkey` o porque su expresión o su predicado lo nombran); o si falta la columna
--     `apodo` o la `tenant_acceso_id`. Se compara por número de columna, nunca por el nombre del
--     índice. Dos endurecimientos sobre la letra del ADR, ambos hacia el lado cerrado: el índice
--     único cuenta aunque no sea válido (un índice a medio construir con `indisready` ya impone la
--     unicidad a las filas nuevas), y la exclusión cuenta como unicidad (`EXCLUDE (apodo WITH =)`
--     también responde «ya existe»). Si la consulta falla (p. ej. la tabla no existe: el `regclass`
--     da 42P01), la función aborta: falla cerrada, sin bloque EXCEPTION que la convierta en éxito.
--   · **Sin carrera.** Dos altas simultáneas sobre `tenants` vacía no pueden ver las dos «cero
--     agencias»: el candado `(7410103, 0)` las serializa, y la cuenta de `tenants` se hace DESPUÉS de
--     obtenerlo, con una instantánea nueva (READ COMMITTED: una por sentencia). Bajo REPEATABLE READ
--     o SERIALIZABLE la instantánea sería la del principio de la transacción, así que mientras la
--     guarda esté activa esos niveles también dan VPR05. Y si `tenants` (global, sin RLS) llegara a
--     tener RLS, el dueño podría contar cero filas: también VPR05.
--   · **Va DESPUÉS de VPR01, VPR04 y VPR02 y ANTES del INSERT.** Nada de lo hecho sobrevive: el
--     consumo del código lo revierte la propia excepción, igual que con VPR02. Así los códigos de
--     error que ya traduce la API conservan su precedencia.
--
-- **El contrato que usa la API** (ADR-0030 §3.2) gana UN código: VPR05 → la API lo traduce como un
-- registro cerrado (503 sin Retry-After o el que decida el PR de backend). Los demás no cambian.
--
-- **Segura en caliente.** Solo reemplaza el cuerpo de una función que hoy nadie llama en producción
-- (el autoservicio está apagado). Sin tablas, columnas, índices ni privilegios nuevos.
--
-- **REVERSIBLE** con una migración posterior: rehacer `crear_agencia` con el cuerpo de
-- 20261120140000, bajo `SET ROLE viajapro_registro` y con el mismo préstamo de CREATE sobre `public`
-- que aquí. **Ojo al revertir ADR-0031 entero:** si se borra `accesos_identidad.apodo` con esta
-- función en vigor, la guarda lo lee como «global» (falta la columna) y cierra el alta para siempre;
-- hay que revertir esta migración ANTES de borrar la columna.
-- =============================================================================

-- Reemplazar exige ser el dueño y CREATE sobre el esquema (CreateFunction lo comprueba también al
-- reemplazar). Se presta a `viajapro_registro`, se crea con su rol y se retira (cinturón), como en
-- 20261120140000 y 20261120150000.
GRANT CREATE ON SCHEMA public TO viajapro_registro;

SET ROLE viajapro_registro;

CREATE OR REPLACE FUNCTION public.crear_agencia(
  p_nombre pg_catalog.text,
  p_slug_base pg_catalog.text,
  p_pais_iso pg_catalog.text,
  p_moneda_iso pg_catalog.text,
  p_zona_horaria pg_catalog.text,
  p_identidad_id pg_catalog.uuid,
  p_dias_de_prueba pg_catalog.int4,
  p_version_encargo pg_catalog.text,
  p_hash_codigo_de_acceso pg_catalog.bytea,
  p_correo_hmac pg_catalog.bytea)
RETURNS pg_catalog.uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  -- TODOS los tipos van calificados (pg_catalog.*), en DECLARE, firma y conversiones: con
  -- search_path vacío PostgreSQL busca los nombres de TIPO primero en pg_temp, y quien llama puede
  -- sembrar ahí un DOMINIO con un CHECK que ejecutaría su código con los privilegios del dueño
  -- (hallazgo B3 de la auditoría de T-268). La migración lo comprueba sobre el cuerpo.
  -- La lista vive en la función (ADR-0030 §3.2). Los prefijos viajapro-* y soporte-* llegan con T-291.
  c_slugs_reservados constant pg_catalog.text[] := ARRAY[
    'admin', 'api', 'app', 'www', 'soporte', 'ayuda', 'viajapro', 'plataforma', 'demo',
    'agencia-demo', 'registro', 'ingresar'];
  -- Candado de DOS claves: espacio propio del registro + hash de la identidad. Los espacios 7410100
  -- y 7410101 son de los disparadores del directorio (20261020010000); los candados de una sola
  -- clave bigint de la API y de las pruebas viven en otro espacio de PostgreSQL.
  c_espacio_del_registro constant pg_catalog.int4 := 7410102;
  -- Espacio de la guarda de ADR-0031 §4: un único candado (7410103, 0) para todas las altas mientras
  -- el índice de apodos sea global.
  c_espacio_de_la_guarda constant pg_catalog.int4 := 7410103;
  c_intentos_con_sufijo  constant pg_catalog.int4 := 5;
  v_contexto   pg_catalog.text := pg_catalog.current_setting('app.current_tenant', true);
  v_nombre     pg_catalog.text := pg_catalog.btrim(p_nombre);
  v_version    pg_catalog.text := pg_catalog.btrim(p_version_encargo);
  v_tope       pg_catalog.int4;
  v_recientes  pg_catalog.int8;
  v_filas      pg_catalog.int8;
  v_id         pg_catalog.uuid;
  v_slug       pg_catalog.text;
  v_creada     pg_catalog.uuid;
  v_intento    pg_catalog.int4;
  v_indice_de_apodos_global pg_catalog.bool;
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
                                           pg_catalog.hashtext(p_identidad_id::pg_catalog.text));
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
     AND t.creado_en > pg_catalog.now() - '1 hour'::pg_catalog.interval;
  IF v_recientes >= v_tope THEN
    RAISE EXCEPTION 'registro_saturado: se alcanzó el tope de altas por hora'
      USING ERRCODE = 'VPR02';
  END IF;

  -- 6. [guarda-apodos] Precondición dura de ADR-0031 §4 (B3): con el índice de apodos GLOBAL no
  --    nace una segunda agencia. El índice se lee del CATÁLOGO, por número de columna y nunca por
  --    nombre; todo calificado con pg_catalog (las RELACIONES también se buscan primero en pg_temp).
  --    Global si: falta apodo o tenant_acceso_id; o un índice único o de exclusión tiene apodo entre
  --    sus columnas CLAVE y no tenant_acceso_id; o un índice de expresión o parcial toca apodo. Si
  --    la tabla no existe, el regclass aborta la función: cerrada. Un NULL también cuenta como global.
  SELECT ap.attnum IS NULL
         OR ta.attnum IS NULL
         OR EXISTS (
              SELECT 1
                FROM pg_catalog.pg_index i
               WHERE i.indrelid = r.relid
                 AND (
                       ((i.indisunique OR i.indisexclusion)
                        AND ap.attnum = ANY (ARRAY(
                              SELECT k.attnum
                                FROM pg_catalog.unnest(i.indkey::pg_catalog.int2[])
                                     WITH ORDINALITY AS k(attnum, n)
                               WHERE k.n <= i.indnkeyatts))
                        AND NOT (ta.attnum = ANY (ARRAY(
                              SELECT k.attnum
                                FROM pg_catalog.unnest(i.indkey::pg_catalog.int2[])
                                     WITH ORDINALITY AS k(attnum, n)
                               WHERE k.n <= i.indnkeyatts))))
                    OR ((i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)
                        AND (ap.attnum = ANY (i.indkey::pg_catalog.int2[])
                             OR COALESCE(pg_catalog.pg_get_expr(i.indexprs, i.indrelid), '')
                                ~ '\mapodo\M'
                             OR COALESCE(pg_catalog.pg_get_expr(i.indpred, i.indrelid), '')
                                ~ '\mapodo\M'))
                     ))
    INTO v_indice_de_apodos_global
    FROM (SELECT 'public.accesos_identidad'::pg_catalog.regclass::pg_catalog.oid AS relid) r
    LEFT JOIN pg_catalog.pg_attribute ap
           ON ap.attrelid = r.relid AND ap.attname = 'apodo'
          AND ap.attnum > 0 AND NOT ap.attisdropped
    LEFT JOIN pg_catalog.pg_attribute ta
           ON ta.attrelid = r.relid AND ta.attname = 'tenant_acceso_id'
          AND ta.attnum > 0 AND NOT ta.attisdropped;

  IF COALESCE(v_indice_de_apodos_global, true) THEN
    -- Un solo candado para todas las altas: la cuenta de abajo, hecha DESPUÉS de obtenerlo y con
    -- una instantánea nueva (READ COMMITTED), ya ve la agencia que otra alta acaba de confirmar.
    -- Con otro nivel de aislamiento la instantánea sería vieja: cerrada también. Y si `tenants`
    -- tuviera RLS, el dueño podría no ver filas y la cuenta daría cero: cerrada también.
    PERFORM pg_catalog.pg_advisory_xact_lock(c_espacio_de_la_guarda, 0);
    IF pg_catalog.current_setting('transaction_isolation') <> 'read committed'
       OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c
                   WHERE c.oid = 'public.tenants'::pg_catalog.regclass AND c.relrowsecurity)
       OR EXISTS (SELECT t.id FROM public.tenants t) THEN
      RAISE EXCEPTION 'registro_cerrado: el alta de agencias no está disponible'
        USING ERRCODE = 'VPR05';
    END IF;
  END IF;
  -- [/guarda-apodos]

  -- 7. La fila NUEVA. El id lo elige la base (v4: PostgreSQL 16 no trae v7, y en `tenants` el orden
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
                || pg_catalog.substr(pg_catalog.gen_random_uuid()::pg_catalog.text, 1, 4);
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

  -- 8. El contexto de la agencia nueva. ÚLTIMA sentencia antes del RETURN y fuera de todo bloque
  --    EXCEPTION (S1): la transacción del llamador queda atada a ESTA agencia.
  PERFORM pg_catalog.set_config('app.current_tenant', v_creada::pg_catalog.text, true);
  RETURN v_creada;
END;
$func$;

-- CREATE OR REPLACE conserva el ACL; se repite igual, por si acaso (el cinturón lo comprueba).
REVOKE ALL ON FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea) TO viajapro_app;
COMMENT ON FUNCTION public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea) IS
  'ADR-0030 §3.2: crea UNA agencia nueva (EN_PRUEBA, AUTOSERVICIO), consume el código de acceso y deja app.current_tenant fijado a ella. Solo inserta; el id lo elige la base. Mientras el índice de apodos de accesos_identidad sea global (ADR-0031 §4), no crea una segunda agencia: VPR05. Errores: 22023, 42501 contexto_de_tenant_no_vacio, VPR01, VPR02, VPR03, VPR04, VPR05. Decimosexta función SECURITY DEFINER; EXECUTE solo para viajapro_app.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_registro;

-- -----------------------------------------------------------------------------
-- Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
--
-- Las aserciones de comportamiento están en `tests/aislamiento.spec.ts` (AP13 en adelante).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  f            record;
  v_rol        text;
  v_fuente     text;
  v_crudo      text;
  v_inicio     integer;
  v_fin        integer;
  v_declaracion text;
  v_global     boolean;
  superficie   text[];
  esperada     text[];
  propias      text[];
  concedidos   text[];
BEGIN
  -- ---- Una sola firma, la de ADR-0030 §3.2, y sus atributos --------------------------------------
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'crear_agencia') <> 1 THEN
    RAISE EXCEPTION 'Tiene que haber exactamente una firma de crear_agencia.';
  END IF;
  SELECT p.oid, p.prosecdef, p.proconfig, p.provolatile, p.proisstrict, p.prosrc, p.proowner,
         p.proacl, l.lanname AS lenguaje,
         pg_get_function_identity_arguments(p.oid) AS argumentos,
         pg_get_function_result(p.oid) AS resultado
    INTO f
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
   WHERE p.oid = 'public.crear_agencia(text, text, text, text, text, uuid, integer, text, bytea, bytea)'::regprocedure;
  IF f.proowner <> 'viajapro_registro'::regrole THEN
    RAISE EXCEPTION 'crear_agencia cambió de dueño: %', f.proowner::regrole;
  END IF;
  IF NOT f.prosecdef THEN
    RAISE EXCEPTION 'crear_agencia dejó de ser SECURITY DEFINER.';
  END IF;
  -- EXACTAMENTE {search_path=""}: una cláusula SET app.current_tenant rompería S1 en silencio.
  IF f.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[] THEN
    RAISE EXCEPTION 'El proconfig de crear_agencia no es exactamente {search_path=""}: %', f.proconfig;
  END IF;
  IF f.proisstrict THEN
    RAISE EXCEPTION 'crear_agencia es STRICT: un NULL daría un NULL silencioso.';
  END IF;
  IF f.provolatile <> 'v' OR f.lenguaje <> 'plpgsql' THEN
    RAISE EXCEPTION 'crear_agencia debe ser plpgsql VOLATILE (es %, %).', f.lenguaje, f.provolatile;
  END IF;
  IF f.argumentos IS DISTINCT FROM
       'p_nombre text, p_slug_base text, p_pais_iso text, p_moneda_iso text, p_zona_horaria text, p_identidad_id uuid, p_dias_de_prueba integer, p_version_encargo text, p_hash_codigo_de_acceso bytea, p_correo_hmac bytea'
     OR f.resultado IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'crear_agencia no tiene la firma de ADR-0030 §3.2: (%) -> %', f.argumentos, f.resultado;
  END IF;

  -- ---- ACL: el dueño y viajapro_app (EXECUTE), nadie más. NULL = el valor por defecto (PUBLIC). ---
  IF f.proacl IS NULL THEN
    RAISE EXCEPTION 'crear_agencia tiene el ACL por defecto: PUBLIC ejecutaría.';
  END IF;
  SELECT array_agg(DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END
                   || ':' || x.privilege_type
                   ORDER BY CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END
                   || ':' || x.privilege_type)
    INTO concedidos
    FROM aclexplode(f.proacl) x
   WHERE x.grantee <> f.proowner;
  IF concedidos IS DISTINCT FROM ARRAY['viajapro_app:EXECUTE'] THEN
    RAISE EXCEPTION 'El ACL de crear_agencia concede a otros que viajapro_app: %', concedidos;
  END IF;
  IF has_function_privilege('public', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'PUBLIC puede ejecutar crear_agencia.';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app')
     AND NOT has_function_privilege('viajapro_app', f.oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'viajapro_app no puede ejecutar crear_agencia.';
  END IF;
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles WHERE rolname IN ('viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    CONTINUE WHEN v_rol = 'viajapro_app';
    IF has_function_privilege(v_rol, f.oid, 'EXECUTE') THEN
      RAISE EXCEPTION '% puede ejecutar crear_agencia: solo la API.', v_rol;
    END IF;
  END LOOP;

  -- ---- El cuerpo: lo que ya exigía 20261120140000 ------------------------------------------------
  -- Sin SQL dinámico, sin bloques de captura (S1), sin DO UPDATE; el ON CONFLICT por slug, el candado
  -- del registro y el id generado por la base.
  IF f.prosrc ~* '\mEXECUTE\M' OR f.prosrc ~* '\mformat\s*\(' THEN
    RAISE EXCEPTION 'crear_agencia contiene SQL dinámico.';
  END IF;
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
  FOREACH v_rol IN ARRAY ARRAY['42501', '22023', 'VPR01', 'VPR02', 'VPR03', 'VPR04', 'VPR05'] LOOP
    IF position('ERRCODE = ''' || v_rol || '''' IN f.prosrc) = 0 THEN
      RAISE EXCEPTION 'crear_agencia perdió el código de error %.', v_rol;
    END IF;
  END LOOP;

  -- B3: ningún nombre de TIPO sin calificar (mismas reglas que 20261120140000), sobre el cuerpo sin
  -- comentarios y con los literales vaciados.
  v_fuente := regexp_replace(f.prosrc, '--[^' || chr(10) || ']*', '', 'g');
  v_crudo := v_fuente;
  v_fuente := regexp_replace(v_fuente, '''[^'']*''', '''''', 'g');
  IF v_fuente ~* '::\s*(?!pg_catalog\.|public\.)[a-z_"]' THEN
    RAISE EXCEPTION 'crear_agencia convierte a un tipo sin calificar (::tipo): B3, pg_temp.';
  END IF;
  IF v_fuente ~* '\mCAST\s*\(' OR v_fuente ~* '%\s*(ROW)?TYPE\M'
     OR v_fuente ~* '\m(text|uuid|bytea|interval|date|time|timetz|timestamp|timestamptz|json|jsonb|numeric|bool|boolean|int2|int4|int8|integer|bigint|smallint|varchar|char|name|oid|regclass)\s+''' THEN
    RAISE EXCEPTION 'crear_agencia usa CAST, %%TYPE o un literal con tipo sin calificar: B3, pg_temp.';
  END IF;
  v_inicio := strpos(upper(v_fuente), 'DECLARE');
  v_fin := strpos(upper(v_fuente), 'BEGIN');
  IF v_inicio = 0 OR v_fin <= v_inicio THEN
    RAISE EXCEPTION 'crear_agencia no tiene un DECLARE ... BEGIN reconocible para comprobar sus tipos.';
  END IF;
  FOR v_declaracion IN
    SELECT btrim(d, E' \t\r\n')
      FROM regexp_split_to_table(substr(v_fuente, v_inicio + 7, v_fin - v_inicio - 7), ';') AS d
  LOOP
    CONTINUE WHEN v_declaracion = '';
    IF v_declaracion !~* '^[a-z_][a-z0-9_]*\s+(constant\s+)?(pg_catalog|public)\.' THEN
      RAISE EXCEPTION 'crear_agencia declara una variable con un tipo sin calificar: «%» (B3, pg_temp).',
        v_declaracion;
    END IF;
  END LOOP;

  -- ---- La guarda de ADR-0031 §4 ------------------------------------------------------------------
  -- Marcas presentes una vez, en orden, y la guarda ANTES del INSERT en tenants y DESPUÉS del
  -- consumo del código (VPR04) y del tope (VPR02).
  IF (length(f.prosrc) - length(replace(f.prosrc, '[guarda-apodos]', ''))) / length('[guarda-apodos]') <> 1
     OR (length(f.prosrc) - length(replace(f.prosrc, '[/guarda-apodos]', ''))) / length('[/guarda-apodos]') <> 1 THEN
    RAISE EXCEPTION 'Las marcas [guarda-apodos] deben aparecer exactamente una vez en crear_agencia.';
  END IF;
  IF NOT (position('ERRCODE = ''VPR02''' IN f.prosrc) < position('[guarda-apodos]' IN f.prosrc)
          AND position('ERRCODE = ''VPR04''' IN f.prosrc) < position('[guarda-apodos]' IN f.prosrc)
          AND position('[guarda-apodos]' IN f.prosrc) < position('ERRCODE = ''VPR05''' IN f.prosrc)
          AND position('ERRCODE = ''VPR05''' IN f.prosrc) < position('[/guarda-apodos]' IN f.prosrc)
          AND position('[/guarda-apodos]' IN f.prosrc) < position('INSERT INTO public.tenants' IN f.prosrc)) THEN
    RAISE EXCEPTION 'La guarda de apodos de crear_agencia no está entre el tope (VPR02) y el INSERT en tenants.';
  END IF;
  -- Lee el catálogo por la tabla real, calificado, y con el regclass que aborta si falta (nunca
  -- to_regclass, que daría NULL y abriría la guarda). Ninguna relación de catálogo sin pg_catalog.
  IF position('''public.accesos_identidad''::pg_catalog.regclass' IN f.prosrc) = 0 THEN
    RAISE EXCEPTION 'La guarda de crear_agencia no resuelve public.accesos_identidad con ::pg_catalog.regclass.';
  END IF;
  IF v_crudo ~* '\mto_regclass\M' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia usa to_regclass: una tabla ausente abriría la guarda.';
  END IF;
  IF v_fuente ~* '(?<!pg_catalog\.)\m(pg_index|pg_attribute|pg_class|pg_namespace|pg_constraint)\M' THEN
    RAISE EXCEPTION 'crear_agencia nombra una relación del catálogo sin pg_catalog (pg_temp la suplantaría).';
  END IF;
  IF v_crudo !~ 'indkey' OR v_crudo !~ 'indnkeyatts' OR v_crudo !~ 'indexprs' OR v_crudo !~ 'indpred'
     OR v_crudo !~ 'indisexclusion' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia no compara por indkey/indnkeyatts ni mira expresiones, predicados y exclusiones.';
  END IF;
  IF v_crudo ~* 'indexrelid|relname' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia mira el NOMBRE del índice: debe comparar por columnas.';
  END IF;
  IF v_crudo !~* 'pg_advisory_xact_lock\s*\(\s*c_espacio_de_la_guarda\s*,\s*0\s*\)'
     OR v_crudo !~ 'c_espacio_de_la_guarda\s+constant\s+pg_catalog\.int4\s*:=\s*7410103' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia no toma el candado único (7410103, 0).';
  END IF;
  IF v_crudo !~ 'COALESCE\(v_indice_de_apodos_global,\s*true\)' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia no trata un NULL como índice global.';
  END IF;
  IF v_crudo !~ 'transaction_isolation' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia no cierra bajo REPEATABLE READ o SERIALIZABLE.';
  END IF;
  IF v_crudo !~ 'relrowsecurity' THEN
    RAISE EXCEPTION 'La guarda de crear_agencia no cierra si tenants tuviera RLS (cuenta ciega).';
  END IF;
  -- `tenants` es global (excepciones_rls): sin RLS, el dueño de la función ve todas sus filas. Con
  -- RLS la guarda cerraría cada alta, que es seguro pero no es lo que se declaró.
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.tenants'::regclass) THEN
    RAISE EXCEPTION 'tenants tiene RLS: la guarda de crear_agencia cerraría toda alta.';
  END IF;

  -- La detección, con el índice que dejó 20261120150000: GLOBAL. Es la misma expresión del cuerpo
  -- (aquí sin calificar: corre como el rol de migraciones, no como SECURITY DEFINER).
  SELECT ap.attnum IS NULL
         OR ta.attnum IS NULL
         OR EXISTS (
              SELECT 1
                FROM pg_index i
               WHERE i.indrelid = r.relid
                 AND (
                       ((i.indisunique OR i.indisexclusion)
                        AND ap.attnum = ANY (ARRAY(
                              SELECT k.attnum FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)
                               WHERE k.n <= i.indnkeyatts))
                        AND NOT (ta.attnum = ANY (ARRAY(
                              SELECT k.attnum FROM unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, n)
                               WHERE k.n <= i.indnkeyatts))))
                    OR ((i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)
                        AND (ap.attnum = ANY (i.indkey::int2[])
                             OR COALESCE(pg_get_expr(i.indexprs, i.indrelid), '') ~ '\mapodo\M'
                             OR COALESCE(pg_get_expr(i.indpred, i.indrelid), '') ~ '\mapodo\M'))
                     ))
    INTO v_global
    FROM (SELECT 'public.accesos_identidad'::regclass::oid AS relid) r
    LEFT JOIN pg_attribute ap
           ON ap.attrelid = r.relid AND ap.attname = 'apodo' AND ap.attnum > 0 AND NOT ap.attisdropped
    LEFT JOIN pg_attribute ta
           ON ta.attrelid = r.relid AND ta.attname = 'tenant_acceso_id' AND ta.attnum > 0 AND NOT ta.attisdropped;
  IF v_global IS NOT TRUE THEN
    RAISE EXCEPTION 'La detección del índice de apodos no da GLOBAL con UNIQUE (apodo) de 20261120150000: la guarda estaría apagada.';
  END IF;
  -- Y el dueño de la función la puede leer sin privilegios de tabla: el catálogo es de PUBLIC.
  FOREACH v_rol IN ARRAY ARRAY['pg_catalog.pg_index', 'pg_catalog.pg_attribute'] LOOP
    IF NOT has_table_privilege('viajapro_registro', v_rol, 'SELECT') THEN
      RAISE EXCEPTION 'viajapro_registro no puede leer %: la guarda fallaría (cerrada) en cada alta.', v_rol;
    END IF;
  END LOOP;

  -- ---- Ningún privilegio nuevo: la superficie de viajapro_registro es la de ADR-0030 §3.1 ---------
  IF has_schema_privilege('viajapro_registro', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'viajapro_registro conserva CREATE sobre public.';
  END IF;
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
    RAISE EXCEPTION 'La superficie de viajapro_registro cambió (ADR-0030 §3.1): %', superficie;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c, aclexplode(c.relacl) x
              WHERE x.grantee = 'viajapro_registro'::regrole) THEN
    RAISE EXCEPTION 'viajapro_registro tiene un privilegio de tabla: su superficie son columnas.';
  END IF;
  SELECT array_agg(format('%s.%s', n.nspname, p.proname)
                   ORDER BY format('%s.%s', n.nspname, p.proname) COLLATE "C")
    INTO propias
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE p.proowner = 'viajapro_registro'::regrole;
  IF propias IS DISTINCT FROM ARRAY['public.codigo_de_acceso_vigente', 'public.crear_agencia'] THEN
    RAISE EXCEPTION 'viajapro_registro debe ser dueño solo de codigo_de_acceso_vigente y crear_agencia; lo es de: %', propias;
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

  -- ---- Lo que NO cambia: viajapro_app sigue sin escribir tenants ----------------------------------
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'viajapro_app') THEN
    FOREACH v_rol IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] LOOP
      IF has_table_privilege('viajapro_app', 'public.tenants', v_rol) THEN
        RAISE EXCEPTION 'viajapro_app tiene % sobre tenants.', v_rol;
      END IF;
    END LOOP;
    IF has_any_column_privilege('viajapro_app', 'public.tenants', 'UPDATE')
       OR has_any_column_privilege('viajapro_app', 'public.tenants', 'INSERT') THEN
      RAISE EXCEPTION 'viajapro_app tiene UPDATE o INSERT de columna sobre tenants.';
    END IF;
  END IF;
END;
$$;
