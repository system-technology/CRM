-- =============================================================================
-- T-089 — RBAC en las mutaciones: `bandeja.operar`, `crm.escribir`, `cotizacion.escribir`
--
-- Qué hace:
--   1. Amplía el catálogo cerrado de permisos (`CHECK roles_permisos_del_catalogo`, creado en
--      20261019230000 y ampliado en 20261026120000, que NO se editan) con los tres permisos de
--      escritura. Es el reflejo de `PERMISOS` en `packages/contracts/src/identidad.ts`: añadir un
--      permiso es editar los dos.
--   2. Se los concede a los roles sembrados `DUENO` y `ASESOR` de toda agencia que ya exista, sin
--      duplicar ninguno y sin quitar los que ya tienen. `OPERACIONES` NO los recibe: queda como el
--      rol de solo lectura sembrado (decisión del propietario, T-089), así que no hace falta un
--      rol `SOLO_LECTURA` ni ampliar `roles_clave_sembrada`. Los roles que creó la agencia (sin
--      `clave`) no se tocan: cómo los compone es decisión suya.
--
-- Por qué el relleno va agencia por agencia con `app.current_tenant` y no con un UPDATE a secas:
-- `roles` tiene RLS FORZADA, y FORCE alcanza al dueño de la tabla. Con un rol de migraciones sin
-- BYPASSRLS, un UPDATE sin contexto vería cero filas y terminaría en verde sin conceder nada (mismo
-- motivo que 20261026120000). La comprobación de cada vuelta falla el despliegue si quedó alguno.
--
-- Segura en caliente: `roles` tiene tres filas por agencia. El CHECK nuevo entra NOT VALID y se
-- valida aparte (SHARE UPDATE EXCLUSIVE, no bloquea lecturas ni escrituras); como solo AMPLÍA la
-- lista, toda fila que cumplía el anterior cumple este.
--
-- REVERSIBLE con una migración nueva: quitar los tres permisos de los arrays de TODOS los roles
-- (`array_remove`, agencia por agencia igual que aquí, incluidos los que la agencia haya creado
-- y compuesto con ellos después) y reponer el CHECK con la lista de cinco de 20261026120000. En
-- ese orden: al revés, el CHECK rechaza las filas. Se pierde qué roles personalizados los tenían.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El catálogo cerrado, con ocho permisos
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
    'cotizacion.escribir'
  ]::text[]
  AND array_position("permisos", NULL) IS NULL
) NOT VALID;

ALTER TABLE "roles" VALIDATE CONSTRAINT "roles_permisos_del_catalogo";

-- -----------------------------------------------------------------------------
-- 2. Concesión a los roles sembrados DUENO y ASESOR de las agencias existentes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  nuevos constant text[] := ARRAY['bandeja.operar', 'crm.escribir', 'cotizacion.escribir'];
  t record;
  faltan integer;
  duplicados integer;
  operaciones_con_escritura integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    -- Solo se añaden los que faltan, en el orden del catálogo: sin duplicados y sin tocar los que
    -- el rol ya tenía (la agencia pudo haberlos editado).
    UPDATE "roles"
       SET "permisos" = "permisos" || ARRAY(
             SELECT p FROM unnest(nuevos) WITH ORDINALITY AS n(p, i)
              WHERE NOT (p = ANY ("permisos"))
              ORDER BY i
           ),
           "actualizado_en" = now()
     WHERE "tenant_id" = t.id
       AND "clave" IN ('DUENO', 'ASESOR')
       AND NOT ("permisos" @> nuevos);

    SELECT count(*) FILTER (WHERE NOT ("permisos" @> nuevos)),
           count(*) FILTER (
             WHERE cardinality("permisos") <> (SELECT count(DISTINCT x) FROM unnest("permisos") x)
           )
      INTO faltan, duplicados
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" IN ('DUENO', 'ASESOR');
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) DUENO/ASESOR sin los permisos de escritura.', t.id, faltan;
    END IF;
    IF duplicados > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) DUENO/ASESOR con permisos duplicados.', t.id, duplicados;
    END IF;

    -- OPERACIONES es el rol de solo lectura: ninguno de los tres puede haberle llegado.
    SELECT count(*) INTO operaciones_con_escritura
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" = 'OPERACIONES'
       AND "permisos" && nuevos;
    IF operaciones_con_escritura > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene OPERACIONES con permisos de escritura.', t.id;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración: un valor colgado haría que lo que corra después en
  -- esta transacción viera las filas de la última agencia del bucle.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- `roles` no cambia de forma, pero se reaplica: idempotente, y deja la tabla gobernada por el
-- mecanismo y no por su historia (mismo idioma que el resto de migraciones).
SELECT aplicar_aislamiento_tenant('roles');
SELECT aplicar_privilegios_declarados();

DO $$
DECLARE
  defectos text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;
END;
$$;
