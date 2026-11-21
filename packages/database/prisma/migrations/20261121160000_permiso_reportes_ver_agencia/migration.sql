-- =============================================================================
-- T-341 (ADR-0035 §3, Eje F del roadmap JD Tours) — el permiso `reportes.ver_agencia`
--
-- **Un solo permiso, y su AUSENCIA es el nivel «propio».** La decisión D3 del propietario es que
-- el asesor vea lo suyo y la dueña vea todo. Ese nivel lo da un permiso, NO la clave del rol
-- (ADR-0035, opción B descartada: los roles son tabla por agencia, R12, y se renombran y se
-- componen; un `if rol === 'DUENO'` se rompe con el primer rol propio). «Propio» es el mínimo de
-- cualquier miembro, así que no existe `reportes.ver_propio`: un permiso sin uso es superficie sin
-- prueba (opción D descartada). Tampoco hay nivel «equipo» (no hay tabla de equipos ni sedes).
--
-- Qué hace, en orden:
--   1. Amplía el catálogo cerrado de permisos (`CHECK roles_permisos_del_catalogo`, creado en
--      20261019230000 y ampliado por última vez en 20261121140000): de CATORCE a QUINCE.
--      `DROP CONSTRAINT` + `ADD ... NOT VALID` + `VALIDATE CONSTRAINT`, el patrón de
--      20261121110000 y 20261121140000. No se edita ninguna migración ya aplicada (CLAUDE.md §10).
--   2. Relleno de las agencias que ya existen: concede `reportes.ver_agencia` al rol con clave
--      `DUENO` de CADA agencia, por `tenant_id`, y a nadie más. **Ni `ASESOR` ni `OPERACIONES`**
--      (ADR-0035 §3, pregunta 2 [No]): sin el permiso ven «Mis números», que es el nivel propio.
--      Los roles que creó la agencia (sin `clave`) NO se tocan: cómo los compone es decisión suya,
--      y puede dárselo desde Ajustes.
--   3. Cinturón: lo dicho, comprobado contra el catálogo (CHECK validado y con el permiso; ningún
--      rol sembrado que no sea DUENO se lo llevó; ningún rol con permisos duplicados; `roles`
--      sigue aislada y con sus privilegios).
--
-- Reflejo exacto en `PERMISOS` de `packages/contracts/src/identidad.ts` (R3: una sola fuente de
-- verdad) y en `ROLES_SEMBRADOS` de `packages/database/prisma/siembra-de-tenant.ts`, que es lo que
-- reciben las agencias NUEVAS. Las dos listas las vigila
-- `packages/database/tests/permisos-de-reportes.spec.ts`.
--
-- **Sin tabla nueva: `aislamiento.spec.ts` no cambia** y no hay excepción de RLS que declarar (R1).
-- `roles` ya tiene `tenant_id`, RLS habilitada y forzada, y su política canónica; el relleno corre
-- agencia por agencia con `app.current_tenant` precisamente porque, con un rol de migraciones sin
-- BYPASSRLS, un `UPDATE` sin contexto vería CERO filas y la migración terminaría en verde sin
-- haber hecho nada (la trampa de 20261115150000). No hay un solo `UPDATE` sin filtro de agencia.
--
-- **Qué NO hace esta migración.** No cambia ningún endpoint: hoy nadie lee el permiso. Quien lo
-- consume es T-342 (`alcanceDeReporte`, contrato con unión discriminada, 403 con `asesorId`
-- ajeno). Entre esta migración y T-342, un DUEÑO tiene el permiso y la API se comporta igual que
-- antes: el permiso es inerte, no abre nada. Lo contrario —el alcance antes que el permiso— sí
-- habría sido un hueco.
--
-- **Segura en caliente (expandir).** Solo amplía una lista admitida y añade un valor a un arreglo.
-- Toda fila que cumplía el CHECK anterior cumple este, por eso el `VALIDATE` no puede fallar y el
-- `NOT VALID` intermedio evita el bloqueo de reescritura. La versión anterior de la API filtra los
-- permisos que no conoce (`soloDelCatalogo` en `membresias.prisma.ts`), así que un DUEÑO con
-- `reportes.ver_agencia` sigue iniciando sesión contra la versión vieja. El relleno toca tres
-- filas por agencia como mucho (hoy, decenas en total: no hay agencia real, CLAUDE.md §1).
--
-- **REVERSIBLE** con una migración posterior, en este orden (al revés el CHECK rechaza filas):
--   UPDATE roles SET permisos = array_remove(permisos, 'reportes.ver_agencia')  -- por agencia,
--     con app.current_tenant, como aquí; incluidos los roles propios que lo hayan recibido
--   reponer roles_permisos_del_catalogo con la lista de catorce de 20261121140000
-- Ningún dato se pierde: no hay columnas ni tablas nuevas (ADR-0035, «qué habría que cambiar para
-- revertirlo»).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El catálogo cerrado pasa a quince
-- -----------------------------------------------------------------------------
ALTER TABLE "roles" DROP CONSTRAINT "roles_permisos_del_catalogo";

ALTER TABLE "roles" ADD CONSTRAINT "roles_permisos_del_catalogo" CHECK (
  "permisos" <@ ARRAY[
    'cotizacion.ver_neto_y_margen',
    'usuarios.administrar',
    'roles.administrar',
    'conversaciones.ver_todas',
    'catalogo.administrar',
    'bandeja.operar',
    'crm.escribir',
    'cotizacion.escribir',
    'archivo.ver',
    'archivo.operar',
    'etiquetas.administrar',
    'cobro.ver',
    'cobro.registrar',
    'cobro.corregir',
    'reportes.ver_agencia'
  ]::text[]
  AND array_position("permisos", NULL) IS NULL
) NOT VALID;

ALTER TABLE "roles" VALIDATE CONSTRAINT "roles_permisos_del_catalogo";

-- -----------------------------------------------------------------------------
-- 2. Relleno: SOLO el rol sembrado `DUENO` de cada agencia
--
-- Las marcas [relleno-reportes] las usa `packages/database/tests/permisos-de-reportes.spec.ts`
-- para reejecutar este bloque sobre agencias de prueba con los roles «como eran antes», dentro de
-- una transacción que se deshace: no las muevas sin mover la prueba. El bloque es idempotente
-- (`NOT (... = ANY (permisos))`), así que reejecutarlo sobre las agencias reales no las cambia.
-- -----------------------------------------------------------------------------
-- [relleno-reportes]
DO $$
DECLARE
  t record;
  faltan integer;
  duplicados integer;
  de_mas integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    UPDATE "roles"
       SET "permisos" = "permisos" || ARRAY['reportes.ver_agencia'],
           "actualizado_en" = now()
     WHERE "tenant_id" = t.id
       AND "clave" = 'DUENO'
       AND NOT ('reportes.ver_agencia' = ANY ("permisos"));

    SELECT count(*) FILTER (WHERE NOT ('reportes.ver_agencia' = ANY ("permisos"))),
           count(*) FILTER (
             WHERE cardinality("permisos") <> (SELECT count(DISTINCT x) FROM unnest("permisos") x)
           )
      INTO faltan, duplicados
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" = 'DUENO';
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con el rol DUENO sin reportes.ver_agencia.', t.id;
    END IF;
    IF duplicados > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con el rol DUENO con permisos duplicados.', t.id;
    END IF;

    -- Ni ASESOR ni OPERACIONES (ADR-0035 §3). Antes de esta migración el CHECK no admitía el
    -- permiso, así que si alguno lo tiene solo pudo ponerlo este relleno.
    SELECT count(*) INTO de_mas
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" IN ('ASESOR', 'OPERACIONES')
       AND 'reportes.ver_agencia' = ANY ("permisos");
    IF de_mas > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene % rol(es) ASESOR/OPERACIONES con reportes.ver_agencia.',
        t.id, de_mas;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración: un valor colgado haría que lo que corra después en
  -- esta transacción viera las filas de la última agencia del bucle.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;
-- [/relleno-reportes]

-- `roles` no cambia de forma, pero se reaplica: idempotente, y deja la tabla gobernada por el
-- mecanismo y no por su historia (mismo idioma que 20261121110000 y 20261121140000).
SELECT aplicar_aislamiento_tenant('roles');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 3. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_tenant uuid;
  de_mas integer;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- `roles` sigue aislada: RLS habilitada Y forzada, con la política canónica.
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.roles'::regclass) THEN
    RAISE EXCEPTION 'roles no tiene RLS habilitada y forzada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p
                  WHERE p.polrelid = 'public.roles'::regclass
                    AND p.polname = 'tenant_isolation'
                    AND p.polcmd = '*'
                    AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
                    AND pg_get_expr(p.polqual, p.polrelid) = pg_get_expr(p.polwithcheck, p.polrelid)) THEN
    RAISE EXCEPTION 'roles no tiene la política tenant_isolation FOR ALL con USING y WITH CHECK iguales.';
  END IF;
  IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = 'roles') THEN
    RAISE EXCEPTION 'roles no puede ser una excepción de RLS.';
  END IF;

  -- El CHECK quedó VALIDADO y con el permiso nuevo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"roles"'::regclass
       AND conname = 'roles_permisos_del_catalogo'
       AND convalidated
       AND pg_get_constraintdef(oid) LIKE '%''reportes.ver_agencia''%'
  ) THEN
    RAISE EXCEPTION 'roles_permisos_del_catalogo no quedó validado con reportes.ver_agencia.';
  END IF;

  -- Y los catorce anteriores siguen ahí: ampliar el catálogo no puede estrecharlo.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"roles"'::regclass
       AND conname = 'roles_permisos_del_catalogo'
       AND pg_get_constraintdef(oid) LIKE '%''cotizacion.ver_neto_y_margen''%'
       AND pg_get_constraintdef(oid) LIKE '%''usuarios.administrar''%'
       AND pg_get_constraintdef(oid) LIKE '%''roles.administrar''%'
       AND pg_get_constraintdef(oid) LIKE '%''conversaciones.ver_todas''%'
       AND pg_get_constraintdef(oid) LIKE '%''catalogo.administrar''%'
       AND pg_get_constraintdef(oid) LIKE '%''bandeja.operar''%'
       AND pg_get_constraintdef(oid) LIKE '%''crm.escribir''%'
       AND pg_get_constraintdef(oid) LIKE '%''cotizacion.escribir''%'
       AND pg_get_constraintdef(oid) LIKE '%''archivo.ver''%'
       AND pg_get_constraintdef(oid) LIKE '%''archivo.operar''%'
       AND pg_get_constraintdef(oid) LIKE '%''etiquetas.administrar''%'
       AND pg_get_constraintdef(oid) LIKE '%''cobro.ver''%'
       AND pg_get_constraintdef(oid) LIKE '%''cobro.registrar''%'
       AND pg_get_constraintdef(oid) LIKE '%''cobro.corregir''%'
  ) THEN
    RAISE EXCEPTION 'roles_permisos_del_catalogo perdió alguno de los catorce permisos anteriores.';
  END IF;

  -- Ningún rol sembrado que no sea DUENO se llevó el permiso, en ninguna agencia. Con
  -- `app.current_tenant`: `roles` tiene RLS forzada y sin contexto se verían cero filas.
  FOR v_tenant IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', v_tenant::text, true);
    SELECT count(*) INTO de_mas
      FROM "roles"
     WHERE "tenant_id" = v_tenant
       AND "clave" IS NOT NULL
       AND "clave" <> 'DUENO'
       AND 'reportes.ver_agencia' = ANY ("permisos");
    IF de_mas > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene % rol(es) sembrado(s) distintos de DUENO con reportes.ver_agencia.',
        v_tenant, de_mas;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant', '', true);

  IF current_setting('app.current_tenant', true) IS DISTINCT FROM ''
     AND current_setting('app.current_tenant', true) IS NOT NULL THEN
    RAISE EXCEPTION 'La migración deja app.current_tenant fijado.';
  END IF;
END;
$$;
