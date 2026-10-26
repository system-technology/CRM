-- =============================================================================
-- ADR-0017, M1 — el permiso `catalogo.administrar`
--
-- Qué hace:
--   1. Amplía el catálogo cerrado de permisos (`CHECK roles_permisos_del_catalogo`, creado en
--      20261019230000, que NO se edita) con `catalogo.administrar`. Es el reflejo de `PERMISOS`
--      en `packages/contracts/src/identidad.ts`: añadir un permiso es editar los dos.
--   2. Se lo concede a los roles sembrados `DUENO` y `OPERACIONES` de toda agencia que ya
--      exista (D2 de ADR-0017). `ASESOR` no lo recibe. Los roles que creó la agencia (sin
--      `clave`) no se tocan: cómo los compone es decisión suya.
--
-- Por qué el relleno va agencia por agencia con `app.current_tenant` y no con un UPDATE a secas:
-- `roles` tiene RLS FORZADA, y FORCE alcanza al dueño de la tabla. Con un rol de migraciones sin
-- BYPASSRLS, un UPDATE sin contexto vería cero filas y terminaría en verde sin conceder nada. Con
-- el contexto puesto, el WITH CHECK de la política se cumple y el resultado no depende de los
-- atributos del rol que migra. La comprobación del final falla el despliegue si quedó alguno.
--
-- Segura en caliente: `roles` tiene tres filas por agencia. Cambiar un CHECK revalida la tabla
-- entera, que aquí son decenas de filas.
--
-- REVERSIBLE con una migración nueva: quitar el permiso de los arrays
-- (`array_remove(permisos, 'catalogo.administrar')`, agencia por agencia igual que aquí) y
-- reponer el CHECK con la lista de cuatro. En ese orden: al revés, el CHECK rechaza las filas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El catálogo cerrado, con cinco permisos
-- -----------------------------------------------------------------------------
ALTER TABLE "roles" DROP CONSTRAINT "roles_permisos_del_catalogo";

ALTER TABLE "roles" ADD CONSTRAINT "roles_permisos_del_catalogo" CHECK (
  "permisos" <@ ARRAY[
    'cotizacion.ver_neto_y_margen',
    'usuarios.administrar',
    'roles.administrar',
    'conversaciones.ver_todas',
    'catalogo.administrar'
  ]::text[]
  AND array_position("permisos", NULL) IS NULL
);

-- -----------------------------------------------------------------------------
-- 2. Concesión a los roles sembrados DUENO y OPERACIONES de las agencias existentes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  faltan integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    UPDATE "roles"
       SET "permisos" = array_append("permisos", 'catalogo.administrar'),
           "actualizado_en" = now()
     WHERE "tenant_id" = t.id
       AND "clave" IN ('DUENO', 'OPERACIONES')
       AND NOT ('catalogo.administrar' = ANY ("permisos"));

    SELECT count(*) INTO faltan
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" IN ('DUENO', 'OPERACIONES')
       AND NOT ('catalogo.administrar' = ANY ("permisos"));
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) sembrado(s) sin catalogo.administrar.', t.id, faltan;
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
