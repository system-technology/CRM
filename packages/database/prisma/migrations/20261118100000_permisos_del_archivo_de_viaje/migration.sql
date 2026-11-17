-- =============================================================================
-- T-249 — ADR-0024 §3.7: los permisos `archivo.ver` y `archivo.operar`
--
-- Qué hace:
--   1. Amplía el catálogo cerrado de permisos (`CHECK roles_permisos_del_catalogo`, creado en
--      20261019230000 y ampliado en 20261026120000 y 20261104130000, que NO se editan) con los
--      dos permisos del archivo de viaje. Es el reflejo de `PERMISOS` en
--      `packages/contracts/src/identidad.ts`: añadir un permiso es editar los dos.
--   2. Se los concede a los TRES roles sembrados `DUENO`, `ASESOR` y `OPERACIONES` de toda agencia
--      que ya exista, sin duplicar ninguno y sin quitar los que ya tienen. OPERACIONES sí recibe
--      `archivo.operar`: confirmar con el proveedor y pagarle es su oficio (ADR-0024 §3.7); sigue
--      sin `bandeja.operar`, `crm.escribir` ni `cotizacion.escribir`. Los roles que creó la agencia
--      (sin `clave`) no se tocan: cómo los compone es decisión suya. Desde aquí un rol propio sin
--      `archivo.ver` deja de leer los archivos (nombres y edades de pasajeros, menores incluidos),
--      que es lo que pidió la auditoría de T-242.
--
-- Por qué el relleno va agencia por agencia con `app.current_tenant` y no con un UPDATE a secas:
-- `roles` tiene RLS FORZADA, y FORCE alcanza al dueño de la tabla. Con un rol de migraciones sin
-- BYPASSRLS, un UPDATE sin contexto vería cero filas y terminaría en verde sin conceder nada (mismo
-- motivo que 20261026120000 y 20261104130000). La comprobación de cada vuelta falla el despliegue
-- si quedó alguno.
--
-- Segura en caliente: `roles` tiene tres filas por agencia. El CHECK nuevo entra NOT VALID y se
-- valida aparte (SHARE UPDATE EXCLUSIVE, no bloquea lecturas ni escrituras); como solo AMPLÍA la
-- lista, toda fila que cumplía el anterior cumple este.
--
-- Orden con el despliegue: la API que exige `archivo.ver`/`archivo.operar` sale DESPUÉS de esta
-- migración (migrar y luego arrancar, como siempre). La API anterior exigía `cotizacion.escribir`
-- y no conoce estos permisos, así que convivir con ella un momento no abre ni cierra nada.
--
-- REVERSIBLE con una migración nueva: quitar los dos permisos de los arrays de TODOS los roles
-- (`array_remove`, agencia por agencia igual que aquí, incluidos los que la agencia haya creado
-- y compuesto con ellos después) y reponer el CHECK con la lista de ocho de 20261104130000. En
-- ese orden: al revés, el CHECK rechaza las filas. Antes, la API tiene que volver a exigir
-- `cotizacion.escribir`. Se pierde qué roles personalizados los tenían.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El catálogo cerrado, con diez permisos
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
    'archivo.operar'
  ]::text[]
  AND array_position("permisos", NULL) IS NULL
) NOT VALID;

ALTER TABLE "roles" VALIDATE CONSTRAINT "roles_permisos_del_catalogo";

-- -----------------------------------------------------------------------------
-- 2. Concesión a los roles sembrados DUENO, ASESOR y OPERACIONES de las agencias existentes
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  nuevos constant text[] := ARRAY['archivo.ver', 'archivo.operar'];
  t record;
  faltan integer;
  duplicados integer;
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
       AND "clave" IN ('DUENO', 'ASESOR', 'OPERACIONES')
       AND NOT ("permisos" @> nuevos);

    SELECT count(*) FILTER (WHERE NOT ("permisos" @> nuevos)),
           count(*) FILTER (
             WHERE cardinality("permisos") <> (SELECT count(DISTINCT x) FROM unnest("permisos") x)
           )
      INTO faltan, duplicados
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" IN ('DUENO', 'ASESOR', 'OPERACIONES');
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) sembrado(s) sin archivo.ver/archivo.operar.', t.id, faltan;
    END IF;
    IF duplicados > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) sembrado(s) con permisos duplicados.', t.id, duplicados;
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

  -- El CHECK quedó validado y con los dos permisos nuevos.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"roles"'::regclass
       AND conname = 'roles_permisos_del_catalogo'
       AND convalidated
       AND pg_get_constraintdef(oid) LIKE '%''archivo.ver''%'
       AND pg_get_constraintdef(oid) LIKE '%''archivo.operar''%'
  ) THEN
    RAISE EXCEPTION 'roles_permisos_del_catalogo no quedó validado con archivo.ver y archivo.operar.';
  END IF;
END;
$$;
