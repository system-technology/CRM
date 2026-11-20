-- =============================================================================
-- T-261 — ADR-0030 §3.3: `perfiles_de_agencia`, con el RNT y su verificación
--
-- La propuesta al viajero tiene que llevar el Registro Nacional de Turismo de la agencia (Ley 300
-- de 1996). Hoy no hay dónde guardarlo: `tenants` no lo tiene, y ADR-0030 decidió que NO lo tenga:
-- esa tabla la leen enteros tres roles de login. Los datos legales de la agencia van en una tabla
-- propia, de agencia, con RLS: `perfiles_de_agencia`.
--
-- ESTA migración trae solo lo que T-261 necesita: `tenant_id`, `rnt` y `verificado_en`. Las columnas
-- `nit`, `digito_verificacion` y `razon_social` del ADR-0030 llegan con T-268 como `ADD COLUMN`
-- (aditivo, sin tocar nada de esta migración): el NIT de una persona natural es su cédula y pide
-- decidir primero su cifrado (ADR-0015, R10). T-268 deja de crear esta tabla.
--
-- Qué hace, en orden:
--   1. `perfiles_de_agencia`: una fila por agencia (`tenant_id` es la PK), con dos CHECK: el RNT son
--      dígitos (1 a 10) y una fila verificada tiene RNT.
--   2. RLS habilitada y FORZADA con la política canónica (`aplicar_aislamiento_tenant`). No es
--      excepción global (R1).
--   3. El disparador `proteger_verificacion_del_perfil`, que NIEGA POR DEFECTO la verificación:
--      lo que declara la agencia no está verificado, y cualquiera podría escribir el RNT de otra.
--      Solo la plataforma conserva un `verificado_en` no nulo (ver abajo).
--   4. `privilegios_declarados`: SOLO `viajapro_app`, SELECT, INSERT y UPDATE. Sin DELETE.
--   5. Cinturón: lo dicho, comprobado contra el catálogo. Las mismas aserciones están en
--      `tests/aislamiento.spec.ts` («T-261»).
--
-- Quién es «la plataforma»: el rol DUEÑO de la tabla, que es el que corre las migraciones y, con
-- T-280, el comando que marca `verificado_en`. Ningún rol de aplicación es dueño ni miembro del
-- dueño. El disparador es SECURITY INVOKER y no confía en nada que el cliente pueda fijar (ni una
-- variable de sesión): pregunta al catálogo quién es `current_user` frente al dueño de la tabla.
--
-- Reglas del disparador (BEFORE INSERT OR UPDATE, por fila):
--   - Cualquier rol que NO sea la plataforma: al insertar, `verificado_en` queda NULL; al
--     actualizar, si cambia el RNT queda NULL, y si no cambia queda como estaba (no puede fijarlo
--     ni borrarlo por su cuenta).
--   - La plataforma: puede fijar `verificado_en`; pero si cambia el RNT sin tocar `verificado_en`,
--     queda NULL (un dato nuevo no hereda la verificación del anterior).
--
-- **Mientras T-280 no exista, nadie verifica.** Con la API el RNT se guarda y se ve en
-- Configuración, pero la propuesta al viajero no lo imprime: el ADR-0030 prohíbe imprimir un RNT
-- sin verificar. Para la agencia piloto, el propietario lo marca una vez a mano con el rol dueño.
--
-- Supuesto SIN verificar contra la fuente oficial: el RNT es un número de hasta 10 dígitos. Si el
-- registro admitiera otro formato, es una migración nueva que relaja `perfiles_de_agencia_rnt_formato`.
--
-- Orden con el despliegue: tabla nueva y privilegios nuevos; nada existente cambia. La API que la
-- usa sale DESPUÉS de esta migración (migrar y luego arrancar). Una agencia sin fila simplemente
-- no tiene RNT: la API la crea al guardar.
--
-- REVERSIBLE con una migración nueva, sin pérdida para el negocio (solo se pierde el RNT que la
-- agencia ya hubiera escrito, que es fácil de volver a escribir):
--   DELETE FROM privilegios_declarados WHERE tabla = 'perfiles_de_agencia';
--   DROP TABLE perfiles_de_agencia;
--   DROP FUNCTION proteger_verificacion_del_perfil();
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. `perfiles_de_agencia`
-- -----------------------------------------------------------------------------
CREATE TABLE "perfiles_de_agencia" (
    "tenant_id"      UUID           NOT NULL,
    -- Lo que la agencia declara. Solo dígitos: ver el encabezado.
    "rnt"            TEXT,
    -- UTC (R9). Solo la plataforma lo fija, tras comprobar el RNT. NULL = sin verificar.
    "verificado_en"  TIMESTAMPTZ(3),
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perfiles_de_agencia_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "perfiles_de_agencia_rnt_formato"
      CHECK ("rnt" IS NULL OR "rnt" ~ '^[0-9]{1,10}$'),
    CONSTRAINT "perfiles_de_agencia_verificado_exige_rnt"
      CHECK ("verificado_en" IS NULL OR "rnt" IS NOT NULL)
);

COMMENT ON TABLE "perfiles_de_agencia" IS
  'Datos legales de la agencia (T-261, ADR-0030 §3.3). Una fila por agencia. Lo que declara la agencia no está verificado: solo la plataforma fija verificado_en (disparador proteger_verificacion_del_perfil).';
COMMENT ON COLUMN "perfiles_de_agencia"."rnt" IS
  'Registro Nacional de Turismo que declara la agencia: solo dígitos. Ningún documento al viajero lo imprime sin verificado_en.';
COMMENT ON COLUMN "perfiles_de_agencia"."verificado_en" IS
  'UTC. Lo fija la plataforma tras comprobar el RNT; NULL = sin verificar. Cambiar el RNT lo devuelve a NULL.';

-- Foránea con `tenants` en cascada. No hay foráneas compuestas: la tabla no apunta a otra de agencia.
ALTER TABLE "perfiles_de_agencia" ADD CONSTRAINT "perfiles_de_agencia_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 2. RLS habilitada y forzada, política canónica con USING y WITH CHECK
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('perfiles_de_agencia');

-- -----------------------------------------------------------------------------
-- 3. El disparador que niega por defecto la verificación
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION proteger_verificacion_del_perfil()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_plataforma boolean;
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
  IF NOT v_plataforma THEN
    IF NEW.rnt IS DISTINCT FROM OLD.rnt THEN
      NEW.verificado_en := NULL;
    ELSE
      NEW.verificado_en := OLD.verificado_en;
    END IF;
  ELSIF NEW.rnt IS DISTINCT FROM OLD.rnt
        AND NEW.verificado_en IS NOT DISTINCT FROM OLD.verificado_en THEN
    NEW.verificado_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION proteger_verificacion_del_perfil() IS
  'Disparador BEFORE INSERT OR UPDATE de perfiles_de_agencia (T-261): solo la plataforma (el dueno de la tabla) conserva un verificado_en no nulo; cambiar el rnt lo anula. SECURITY INVOKER, search_path vacio.';

REVOKE ALL ON FUNCTION proteger_verificacion_del_perfil() FROM PUBLIC;

CREATE TRIGGER "perfiles_de_agencia_proteger_verificacion"
  BEFORE INSERT OR UPDATE ON "perfiles_de_agencia"
  FOR EACH ROW EXECUTE FUNCTION proteger_verificacion_del_perfil();

-- -----------------------------------------------------------------------------
-- 4. Privilegios declarados (ADR-0024 §5.2): solo `viajapro_app`
-- -----------------------------------------------------------------------------
INSERT INTO privilegios_declarados (tabla, rol, privilegios, motivo) VALUES
  ('perfiles_de_agencia', 'viajapro_app', '{SELECT,INSERT,UPDATE}',
   'T-261: la API lee y escribe el RNT de la agencia con viajapro_app, bajo RLS. Sin DELETE. El disparador impide que ese rol fije verificado_en.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_rol text;
  reales text[];
  esperados text[];
BEGIN
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
  IF NOT (SELECT a.attnotnull FROM pg_attribute a
           WHERE a.attrelid = 'public.perfiles_de_agencia'::regclass
             AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
    RAISE EXCEPTION 'perfiles_de_agencia.tenant_id admite nulos.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'perfiles_de_agencia') THEN
    RAISE EXCEPTION 'perfiles_de_agencia no puede ser una excepción de RLS.';
  END IF;
  IF EXISTS (SELECT 1 FROM privilegios_declarados d JOIN excepciones_rls e ON e.tabla = d.tabla) THEN
    RAISE EXCEPTION 'Una tabla está a la vez en excepciones_rls y en privilegios_declarados.';
  END IF;

  -- Una agencia, una fila: la PK es exactamente tenant_id.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conrelid = 'public.perfiles_de_agencia'::regclass
       AND c.contype = 'p'
       AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                              WHERE attrelid = 'public.perfiles_de_agencia'::regclass
                                AND attname = 'tenant_id')]::int2[]
  ) THEN
    RAISE EXCEPTION 'La clave primaria de perfiles_de_agencia no es (tenant_id).';
  END IF;

  -- El disparador: BEFORE INSERT OR UPDATE por fila, habilitado, SECURITY INVOKER, search_path
  -- vacío y sin EXECUTE para PUBLIC.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.perfiles_de_agencia'::regclass
       AND NOT t.tgisinternal
       AND t.tgenabled = 'O'
       AND pg_get_triggerdef(t.oid) ~ 'BEFORE INSERT OR UPDATE ON (public\.)?perfiles_de_agencia FOR EACH ROW'
  ) THEN
    RAISE EXCEPTION 'perfiles_de_agencia no tiene el disparador BEFORE INSERT OR UPDATE por fila habilitado.';
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

  -- La matriz de privilegios: `viajapro_app` SELECT, INSERT, UPDATE; todos los demás, nada.
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    SELECT COALESCE(array_agg(p ORDER BY p), '{}')
      INTO reales
      FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
     WHERE has_table_privilege(v_rol, 'public.perfiles_de_agencia', p);
    esperados := CASE WHEN v_rol = 'viajapro_app'
                      THEN ARRAY['INSERT', 'SELECT', 'UPDATE'] ELSE '{}'::text[] END;
    IF reales IS DISTINCT FROM esperados THEN
      RAISE EXCEPTION 'Privilegios de % sobre perfiles_de_agencia: % (se esperaba %).', v_rol, reales, esperados;
    END IF;
    IF v_rol <> 'viajapro_app'
       AND (has_any_column_privilege(v_rol, 'public.perfiles_de_agencia', 'SELECT')
            OR has_any_column_privilege(v_rol, 'public.perfiles_de_agencia', 'INSERT')
            OR has_any_column_privilege(v_rol, 'public.perfiles_de_agencia', 'UPDATE')) THEN
      RAISE EXCEPTION '% tiene privilegios de columna sobre perfiles_de_agencia.', v_rol;
    END IF;
  END LOOP;

  IF has_table_privilege('public', 'public.perfiles_de_agencia', 'SELECT') THEN
    RAISE EXCEPTION 'PUBLIC puede leer perfiles_de_agencia.';
  END IF;
END;
$$;
