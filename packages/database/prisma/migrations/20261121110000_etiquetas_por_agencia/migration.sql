-- =============================================================================
-- T-324 (HU-inbox-1 §3, B1 del roadmap JD Tours) — etiquetas de la agencia y su asignación a la
-- conversación
--
-- Hoy `conversaciones.etiquetas` es un `TEXT[]` libre, sin color ni catálogo, que nada escribe y
-- nada pinta. La historia decide (HU-inbox-1 §2) que la etiqueta es de la CONVERSACIÓN, con un
-- catálogo POR AGENCIA (R12: tabla, nunca `enum`), con color de una paleta fija del sistema de
-- diseño. `contactos.etiquetas` NO se toca (son atributos duraderos del contacto, §2).
--
-- Qué hace, en orden:
--   1. `etiquetas` (tenant_id NOT NULL, nombre, color, orden y auditoría): única por agencia sobre
--      `lower(btrim(nombre))`, color validado por CHECK contra las ocho claves de la paleta.
--   2. `conversacion_etiquetas` (tenant_id, conversacion_id, etiqueta_id, asignada_en,
--      asignada_por): clave primaria (tenant_id, conversacion_id, etiqueta_id) —poner dos veces la
--      misma no duplica— y foráneas COMPUESTAS con el tenant hacia la conversación, la etiqueta y
--      el usuario: una asignación no puede cruzar agencias ni aunque falle un `WHERE`.
--   3. RLS habilitada y FORZADA con la política canónica (`aplicar_aislamiento_tenant`) en las dos.
--   4. `privilegios_declarados`: SOLO `viajapro_app` (la API: bandeja y Configuración). El
--      trabajador (`viajapro_webhook`) y las altas (`viajapro_altas`) no las tocan, y
--      `viajapro_identidad` tampoco.
--   5. Siembra, agencia por agencia, de «Pagado» (verde), «Pago pendiente» (ámbar) y «Seguimiento»
--      (azul), sin duplicar si la agencia ya tiene una con ese nombre normalizado.
--   6. Copia de `conversaciones.etiquetas` al catálogo de su agencia (color `gris`) con sus
--      asignaciones. SOLO COPIA: la columna se queda y nadie la escribe; se retira en una
--      migración posterior cuando T-325 cambie el contrato (`ConversacionResumen.etiquetas`).
--   7. El permiso `etiquetas.administrar` (crear, renombrar, recolorear, ordenar y borrar): amplía
--      el CHECK cerrado `roles_permisos_del_catalogo` (once permisos) y se concede al rol sembrado
--      `DUENO` de las agencias existentes. Reflejo de `PERMISOS` en
--      `packages/contracts/src/identidad.ts`.
--   8. Cinturón: lo dicho, comprobado contra el catálogo.
--
-- **Topes (50 por agencia, 10 por conversación): NO van en la base.** La historia los llama
-- «supuestos» (§3, §7: «si la respuesta los contradice, cambia un tope, no el modelo»): son
-- política de producto que puede moverse, no un invariante del dominio, y en un disparador
-- cambiarlos costaría una migración. Los impone la API (T-325) con error tipado, serializando por
-- agencia/conversación para que dos peticiones simultáneas no los rebasen. Superarlos no cruza
-- agencias ni corrompe datos: no son una propiedad de aislamiento. La copia del paso 6 puede dejar
-- a una agencia por encima de 50 si su arreglo libre tenía más valores distintos: es dato heredado,
-- no se pierde, y la API solo impedirá crear más.
--
-- **Color: CHECK, no tabla global.** La paleta es un invariante de accesibilidad del producto
-- (HU-inbox-1 §3: contraste AA, sin rojo), no política de la agencia: la agencia elige UNA de las
-- ocho, no define colores. Es el mismo patrón que `roles_permisos_del_catalogo` (catálogo cerrado
-- por CHECK, no `enum` de Postgres: ampliarlo es `DROP/ADD CONSTRAINT ... NOT VALID` + `VALIDATE`,
-- sin reescribir la tabla ni bloquear escrituras). Una tabla de referencia global habría exigido
-- una excepción nueva en `excepciones_rls` y en el literal de `aislamiento.spec.ts` sin ganar nada.
--
-- **Borrado FÍSICO, a propósito.** La historia lo fija (§3 «Borrar en uso»: «Borra la etiqueta y
-- sus asignaciones. No se puede deshacer»). La etiqueta es configuración de la agencia, sin PII de
-- viajeros ni valor contable (ningún saldo ni reporte se calcula con ella, §2); la asignación es
-- estado de trabajo que se pone y se quita. Un borrado lógico obligaría a que la unicidad por
-- nombre fuera parcial y a filtrar `eliminado_en` en cada lectura de la bandeja, sin evidencia que
-- conservar. Por eso las foráneas hacia la etiqueta y hacia la conversación van en CASCADE.
--
-- **Sin datos personales sensibles (R10).** `etiquetas.nombre` es texto libre de la agencia y PODRÍA
-- llevar un nombre de persona: la historia (§3) exige que logs, eventos y outbox lleven SOLO ids.
-- No es PII sensible de viajeros (pasaporte, nacimiento): va en claro bajo RLS, como
-- `motivos_de_perdida.etiqueta`.
--
-- **Segura en caliente (expandir).** Dos tablas nuevas y la ampliación de un CHECK. Nada se borra
-- ni se renombra: la versión anterior de la API sigue leyendo `conversaciones.etiquetas`, que no
-- cambia, y no conoce las tablas nuevas. El CHECK de permisos entra NOT VALID y se valida aparte
-- (SHARE UPDATE EXCLUSIVE); como solo AMPLÍA la lista, toda fila que cumplía el anterior cumple
-- este. La API anterior filtra los permisos que no conoce (`soloDelCatalogo` en
-- `membresias.prisma.ts`), así que un DUEÑO con `etiquetas.administrar` sigue entrando con ella.
-- Los rellenos son por agencia sobre `conversaciones` (decenas de filas hoy: no hay agencia real,
-- CLAUDE.md §1) y `roles` (tres filas por agencia). Los índices van sin CONCURRENTLY porque Prisma
-- corre la migración en una transacción y las tablas nacen vacías.
--
-- **REVERSIBLE** con una migración posterior, en este orden (al revés el CHECK rechaza filas):
--   UPDATE roles SET permisos = array_remove(permisos, 'etiquetas.administrar')   -- por agencia,
--     con app.current_tenant, como aquí; incluidos los roles propios que lo hayan recibido
--   reponer roles_permisos_del_catalogo con la lista de diez de 20261118100000
--   DELETE FROM privilegios_declarados WHERE tabla IN ('etiquetas', 'conversacion_etiquetas');
--   DROP TABLE conversacion_etiquetas; DROP TABLE etiquetas;
-- `conversaciones.etiquetas` sigue intacta, así que la copia no se pierde. Lo que se pierde: las
-- etiquetas creadas, sus colores y las asignaciones hechas desde T-325.
-- =============================================================================

-- uuid v7 en SQL, solo para la siembra (la aplicación los genera con Prisma). OR REPLACE: otras
-- migraciones crean la misma en `pg_temp`, y la aserción 23 las corre todas en la misma sesión.
CREATE OR REPLACE FUNCTION pg_temp.uuid_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT encode(
    set_bit(set_bit(
      overlay(uuid_send(gen_random_uuid())
              PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
              FROM 1 FOR 6),
      52, 1), 53, 1),
    'hex')::uuid
$$;

-- -----------------------------------------------------------------------------
-- 1. `etiquetas`
-- -----------------------------------------------------------------------------
CREATE TABLE "etiquetas" (
    "id"              UUID           NOT NULL,
    "tenant_id"       UUID           NOT NULL,
    -- 1 a 30 caracteres, sin espacios a los lados ni caracteres de control (un salto de línea en
    -- un chip rompe la fila de la bandeja). La API normaliza; la base no admite otra cosa.
    "nombre"          VARCHAR(30)    NOT NULL,
    -- Clave de la paleta del sistema de diseño (ver el encabezado). Sin hexadecimales libres.
    "color"           VARCHAR(16)    NOT NULL,
    -- Orden de la agencia: el de los chips y el de la lista de Configuración. No es único (reordenar
    -- no tiene que esquivar una unicidad); empates, por nombre.
    "orden"           SMALLINT       NOT NULL DEFAULT 0,
    "creado_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Nulos en lo sembrado y en lo copiado por esta migración: no lo creó ningún usuario.
    "creado_por"      UUID,
    "actualizado_por" UUID,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "etiquetas_nombre_forma" CHECK (
      "nombre" = btrim("nombre")
      AND char_length("nombre") BETWEEN 1 AND 30
      AND "nombre" !~ '[[:cntrl:]]'
    ),
    CONSTRAINT "etiquetas_color_de_la_paleta" CHECK (
      "color" IN ('gris', 'azul', 'turquesa', 'verde', 'ambar', 'naranja', 'rosa', 'dorado')
    ),
    CONSTRAINT "etiquetas_orden_no_negativo" CHECK ("orden" >= 0)
);

COMMENT ON TABLE "etiquetas" IS
  'Etiquetas de conversación de la agencia (Label, T-324, HU-inbox-1). Catálogo por agencia (R12); color de la paleta fija (CHECK). Borrado físico: se lleva sus asignaciones. Logs y eventos llevan solo el id, nunca el nombre.';
COMMENT ON COLUMN "etiquetas"."nombre" IS
  'Texto libre de la agencia, 1 a 30 caracteres, sin espacios a los lados. Único por agencia sobre lower(btrim(nombre)). Puede contener un nombre de persona: nunca a logs, eventos ni outbox.';
COMMENT ON COLUMN "etiquetas"."color" IS
  'Clave de la paleta del sistema de diseño: gris, azul, turquesa, verde, ambar, naranja, rosa o dorado. Sin rojo (reservado a vencido y destructivo).';

-- «Pagado» y «pagado » chocan (HU-inbox-1 §3, ETIQUETA_DUPLICADA). Es el destino del
-- ON CONFLICT DO NOTHING de la siembra. Con el tenant delante.
CREATE UNIQUE INDEX "etiquetas_tenant_id_nombre_normalizado_key"
  ON "etiquetas" ("tenant_id", lower(btrim("nombre")));
-- Destino de las foráneas compuestas de `conversacion_etiquetas`.
CREATE UNIQUE INDEX "etiquetas_id_tenant_id_key" ON "etiquetas" ("id", "tenant_id");
-- El catálogo que pinta la web: por agencia, en orden.
CREATE INDEX "etiquetas_tenant_id_orden_idx" ON "etiquetas" ("tenant_id", "orden");

ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- NO ACTION y no RESTRICT (mismo criterio que 20261115150000 §4): al purgar un tenant la cascada
-- se lleva usuarios y etiquetas en la misma sentencia, y RESTRICT se comprobaría a mitad de ella.
-- Los usuarios se dan de baja con `eliminado_en`, así que fuera de la purga nunca se dispara.
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 2. `conversacion_etiquetas`
-- -----------------------------------------------------------------------------
CREATE TABLE "conversacion_etiquetas" (
    "tenant_id"       UUID           NOT NULL,
    "conversacion_id" UUID           NOT NULL,
    "etiqueta_id"     UUID           NOT NULL,
    -- UTC (R9). En lo copiado por esta migración, el instante de la copia: el arreglo libre no
    -- guardaba cuándo se puso cada valor.
    "asignada_en"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Nulo en lo copiado por esta migración.
    "asignada_por"    UUID,

    -- Poner dos veces la misma etiqueta no duplica (idempotente, R5): la API inserta con
    -- ON CONFLICT DO NOTHING. Con el tenant delante, y sirve también para leer las etiquetas de
    -- una conversación (la ficha del chat y el armado de la lista).
    CONSTRAINT "conversacion_etiquetas_pkey" PRIMARY KEY ("tenant_id", "conversacion_id", "etiqueta_id")
);

COMMENT ON TABLE "conversacion_etiquetas" IS
  'Qué etiquetas tiene cada conversación (T-324, HU-inbox-1). Foráneas compuestas con el tenant hacia la conversación, la etiqueta y el usuario: una asignación no cruza agencias. Ayuda visual: ningún saldo ni estado de cobro se calcula con ella.';

-- El filtro de la bandeja por etiqueta (HU-inbox-1 §4.3): de la etiqueta a sus conversaciones,
-- con el tenant delante. Sostiene también el CASCADE al borrar una etiqueta.
CREATE INDEX "conversacion_etiquetas_tenant_etiqueta_conversacion_idx"
  ON "conversacion_etiquetas" ("tenant_id", "etiqueta_id", "conversacion_id");

ALTER TABLE "conversacion_etiquetas" ADD CONSTRAINT "conversacion_etiquetas_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CASCADE: borrar la conversación (solo la purga: la API las borra con `eliminado_en`) o la
-- etiqueta (§3 «Borrar en uso») se lleva las asignaciones. La referida es la unicidad
-- (id, tenant_id) que ya sostiene las foráneas de `mensajes` y `notas_internas`.
ALTER TABLE "conversacion_etiquetas" ADD CONSTRAINT "conversacion_etiquetas_conversacion_id_tenant_id_fkey"
  FOREIGN KEY ("conversacion_id", "tenant_id") REFERENCES "conversaciones" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "conversacion_etiquetas" ADD CONSTRAINT "conversacion_etiquetas_etiqueta_id_tenant_id_fkey"
  FOREIGN KEY ("etiqueta_id", "tenant_id") REFERENCES "etiquetas" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "conversacion_etiquetas" ADD CONSTRAINT "conversacion_etiquetas_asignada_por_tenant_id_fkey"
  FOREIGN KEY ("asignada_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. RLS habilitada y forzada, política canónica con USING y WITH CHECK
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('etiquetas');
SELECT aplicar_aislamiento_tenant('conversacion_etiquetas');

-- -----------------------------------------------------------------------------
-- 4. Privilegios declarados (ADR-0024 §5.2): solo `viajapro_app`
--
-- `conversacion_etiquetas` sin UPDATE: una asignación se pone (INSERT ... ON CONFLICT DO NOTHING)
-- o se quita (DELETE); no hay nada que editar en ella.
-- -----------------------------------------------------------------------------
INSERT INTO privilegios_declarados (tabla, rol, privilegios, motivo) VALUES
  ('etiquetas', 'viajapro_app', '{SELECT,INSERT,UPDATE,DELETE}',
   'T-324: la API lee el catálogo de etiquetas de la agencia y lo gestiona (etiquetas.administrar), bajo RLS. Borrado físico (HU-inbox-1 §3).'),
  ('conversacion_etiquetas', 'viajapro_app', '{SELECT,INSERT,DELETE}',
   'T-324: la API pone y quita etiquetas de una conversación (bandeja.operar) y filtra la bandeja, bajo RLS. Sin UPDATE: una asignación se pone o se quita.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5 y 6. Siembra y copia, agencia por agencia
--
-- Con `app.current_tenant`: las tablas tienen RLS FORZADA y, con un rol de migraciones sin
-- BYPASSRLS, una sentencia sin contexto vería cero filas y terminaría en verde sin hacer nada
-- (mismo motivo que 20261115150000). Cada vuelta comprueba su resultado.
--
-- La copia normaliza como lo hará la API: los caracteres de control pasan a espacio, se recortan
-- los lados, se corta a 30 caracteres y se vuelve a recortar. Lo que queda vacío (o NULL dentro
-- del arreglo) no es una etiqueta y no se copia. Dos valores que solo difieren en mayúsculas o
-- espacios («VIP», «vip ») son LA MISMA etiqueta: gana el primero en orden de bytes, y las dos
-- conversaciones quedan con ella. Un valor que coincide con una sembrada («pagado») se asigna a la
-- sembrada, que conserva su color.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.etiquetas_heredadas(p_tenant uuid)
RETURNS TABLE (conversacion_id uuid, nombre text)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT v.conversacion_id, v.nombre
    FROM (
      SELECT c.id AS conversacion_id,
             btrim(left(btrim(regexp_replace(e.valor, '[[:cntrl:]]+', ' ', 'g')), 30)) AS nombre
        FROM conversaciones c
        CROSS JOIN LATERAL unnest(c.etiquetas) AS e(valor)
       WHERE c.tenant_id = p_tenant
    ) v
   WHERE v.nombre <> ''
$$;

DO $$
DECLARE
  t record;
  sembradas integer;
  sin_copiar integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    -- 5. Las tres por defecto. ON CONFLICT sin destino: el árbitro es toda unicidad, incluida la
    -- del nombre normalizado. Si la agencia ya tiene una con ese nombre, se le deja la suya.
    INSERT INTO "etiquetas" ("id", "tenant_id", "nombre", "color", "orden")
    SELECT pg_temp.uuid_v7(), t.id, v.nombre, v.color, v.orden
      FROM (VALUES
        ('Pagado',         'verde', 0),
        ('Pago pendiente', 'ambar', 1),
        ('Seguimiento',    'azul',  2)
      ) AS v(nombre, color, orden)
    ON CONFLICT DO NOTHING;

    SELECT count(*) INTO sembradas
      FROM "etiquetas"
     WHERE "tenant_id" = t.id
       AND lower(btrim("nombre")) IN ('pagado', 'pago pendiente', 'seguimiento');
    IF sembradas <> 3 THEN
      RAISE EXCEPTION 'La agencia % quedó con % de 3 etiquetas sembradas.', t.id, sembradas;
    END IF;

    -- 6a. Al catálogo, una por nombre normalizado, en gris, detrás de las que ya hay.
    INSERT INTO "etiquetas" ("id", "tenant_id", "nombre", "color", "orden")
    SELECT pg_temp.uuid_v7(), t.id, d.nombre, 'gris',
           LEAST(32767,
                 (SELECT COALESCE(max(x."orden"), -1) FROM "etiquetas" x WHERE x."tenant_id" = t.id)
                 + row_number() OVER (ORDER BY d.clave))::smallint
      FROM (
        SELECT lower(h.nombre) AS clave, min(h.nombre COLLATE "C") AS nombre
          FROM pg_temp.etiquetas_heredadas(t.id) h
         GROUP BY lower(h.nombre)
      ) d
     WHERE NOT EXISTS (
       SELECT 1 FROM "etiquetas" x
        WHERE x."tenant_id" = t.id AND lower(btrim(x."nombre")) = d.clave
     )
    ON CONFLICT DO NOTHING;

    -- 6b. Las asignaciones, contra el catálogo por nombre normalizado.
    INSERT INTO "conversacion_etiquetas" ("tenant_id", "conversacion_id", "etiqueta_id", "asignada_en")
    SELECT DISTINCT t.id, h.conversacion_id, x."id", now()
      FROM pg_temp.etiquetas_heredadas(t.id) h
      JOIN "etiquetas" x
        ON x."tenant_id" = t.id AND lower(btrim(x."nombre")) = lower(h.nombre)
    ON CONFLICT DO NOTHING;

    -- Todo valor heredado quedó asignado a SU conversación, con una etiqueta de SU agencia.
    SELECT count(*) INTO sin_copiar
      FROM pg_temp.etiquetas_heredadas(t.id) h
     WHERE NOT EXISTS (
       SELECT 1
         FROM "conversacion_etiquetas" ce
         JOIN "etiquetas" x ON x."id" = ce."etiqueta_id" AND x."tenant_id" = ce."tenant_id"
        WHERE ce."tenant_id" = t.id
          AND ce."conversacion_id" = h.conversacion_id
          AND lower(btrim(x."nombre")) = lower(h.nombre)
     );
    IF sin_copiar > 0 THEN
      RAISE EXCEPTION 'La agencia % tiene % etiqueta(s) de conversación sin copiar.', t.id, sin_copiar;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración: un valor colgado haría que lo que corra después en
  -- esta transacción viera las filas de la última agencia del bucle.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. El permiso `etiquetas.administrar`: catálogo cerrado con once, y al DUEÑO
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
    'etiquetas.administrar'
  ]::text[]
  AND array_position("permisos", NULL) IS NULL
) NOT VALID;

ALTER TABLE "roles" VALIDATE CONSTRAINT "roles_permisos_del_catalogo";

-- Solo al rol sembrado DUENO (HU-inbox-1 §3 y §7: «solo el dueño crea etiquetas; las asesoras
-- ponen y quitan» con `bandeja.operar`, que ya tienen). La agencia puede dárselo a ASESOR. Los
-- roles que creó la agencia (sin `clave`) no se tocan: cómo los compone es decisión suya.
DO $$
DECLARE
  t record;
  faltan integer;
  duplicados integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    UPDATE "roles"
       SET "permisos" = "permisos" || ARRAY['etiquetas.administrar'],
           "actualizado_en" = now()
     WHERE "tenant_id" = t.id
       AND "clave" = 'DUENO'
       AND NOT ('etiquetas.administrar' = ANY ("permisos"));

    SELECT count(*) FILTER (WHERE NOT ('etiquetas.administrar' = ANY ("permisos"))),
           count(*) FILTER (
             WHERE cardinality("permisos") <> (SELECT count(DISTINCT x) FROM unnest("permisos") x)
           )
      INTO faltan, duplicados
      FROM "roles"
     WHERE "tenant_id" = t.id
       AND "clave" = 'DUENO';
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con el rol DUENO sin etiquetas.administrar.', t.id;
    END IF;
    IF duplicados > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con el rol DUENO con permisos duplicados.', t.id;
    END IF;
  END LOOP;

  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- `roles` no cambia de forma, pero se reaplica: idempotente, y deja la tabla gobernada por el
-- mecanismo y no por su historia (mismo idioma que 20261118100000).
SELECT aplicar_aislamiento_tenant('roles');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 8. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_tabla text;
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

  FOREACH v_tabla IN ARRAY ARRAY['etiquetas', 'conversacion_etiquetas'] LOOP
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
             WHERE oid = ('public.' || v_tabla)::regclass) THEN
      RAISE EXCEPTION '% no tiene RLS habilitada y forzada.', v_tabla;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy p
                    WHERE p.polrelid = ('public.' || v_tabla)::regclass
                      AND p.polname = 'tenant_isolation'
                      AND p.polcmd = '*'
                      AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
                      AND pg_get_expr(p.polqual, p.polrelid) = pg_get_expr(p.polwithcheck, p.polrelid)) THEN
      RAISE EXCEPTION '% no tiene la política tenant_isolation FOR ALL con USING y WITH CHECK iguales.', v_tabla;
    END IF;
    IF NOT (SELECT a.attnotnull FROM pg_attribute a
             WHERE a.attrelid = ('public.' || v_tabla)::regclass
               AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
      RAISE EXCEPTION '%.tenant_id admite nulos.', v_tabla;
    END IF;
    IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = v_tabla) THEN
      RAISE EXCEPTION '% no puede ser una excepción de RLS.', v_tabla;
    END IF;

    -- La matriz de privilegios: solo `viajapro_app`, exactamente lo declarado; los demás, nada.
    FOR v_rol IN
      SELECT rolname FROM roles_de_login_vigilados
      UNION
      SELECT rolname FROM pg_roles
       WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
    LOOP
      SELECT COALESCE(array_agg(p ORDER BY p), '{}')
        INTO reales
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
       WHERE has_table_privilege(v_rol, 'public.' || v_tabla, p);
      esperados := CASE
        WHEN v_rol <> 'viajapro_app' THEN '{}'::text[]
        WHEN v_tabla = 'etiquetas' THEN ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']
        ELSE ARRAY['DELETE', 'INSERT', 'SELECT']
      END;
      IF reales IS DISTINCT FROM esperados THEN
        RAISE EXCEPTION 'Privilegios de % sobre %: % (se esperaba %).', v_rol, v_tabla, reales, esperados;
      END IF;
    END LOOP;

    IF has_table_privilege('public', 'public.' || v_tabla, 'SELECT') THEN
      RAISE EXCEPTION 'PUBLIC puede leer %.', v_tabla;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM privilegios_declarados d JOIN excepciones_rls e ON e.tabla = d.tabla) THEN
    RAISE EXCEPTION 'Una tabla está a la vez en excepciones_rls y en privilegios_declarados.';
  END IF;

  -- Las tres foráneas de la asignación hacia tablas de agencia son COMPUESTAS con el tenant y
  -- están validadas.
  IF (SELECT count(*) FROM pg_constraint c
       WHERE c.conrelid = 'public.conversacion_etiquetas'::regclass
         AND c.contype = 'f'
         AND c.convalidated
         AND c.conname IN ('conversacion_etiquetas_conversacion_id_tenant_id_fkey',
                           'conversacion_etiquetas_etiqueta_id_tenant_id_fkey',
                           'conversacion_etiquetas_asignada_por_tenant_id_fkey')
         AND cardinality(c.conkey) = 2
         AND (SELECT attnum FROM pg_attribute
               WHERE attrelid = c.conrelid AND attname = 'tenant_id') = ANY (c.conkey)) <> 3 THEN
    RAISE EXCEPTION 'Falta (o no es compuesta con tenant_id, o no está validada) una foránea de conversacion_etiquetas.';
  END IF;

  -- La unicidad por agencia del nombre normalizado existe y lleva el tenant.
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = 'public.etiquetas_tenant_id_nombre_normalizado_key'::regclass
       AND i.indisunique
       AND i.indrelid = 'public.etiquetas'::regclass
       AND i.indnkeyatts = 2
       AND i.indkey[0] = (SELECT attnum FROM pg_attribute
                           WHERE attrelid = 'public.etiquetas'::regclass AND attname = 'tenant_id')
       AND i.indpred IS NULL
       AND pg_get_indexdef(i.indexrelid) ~ 'lower\(btrim\(\(?nombre'
  ) THEN
    RAISE EXCEPTION 'Falta la unicidad (tenant_id, lower(btrim(nombre))) de etiquetas.';
  END IF;

  -- El CHECK de permisos quedó validado y con el permiso nuevo.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conrelid = '"roles"'::regclass
       AND conname = 'roles_permisos_del_catalogo'
       AND convalidated
       AND pg_get_constraintdef(oid) LIKE '%''etiquetas.administrar''%'
  ) THEN
    RAISE EXCEPTION 'roles_permisos_del_catalogo no quedó validado con etiquetas.administrar.';
  END IF;

  IF current_setting('app.current_tenant', true) IS DISTINCT FROM ''
     AND current_setting('app.current_tenant', true) IS NOT NULL THEN
    RAISE EXCEPTION 'La migración deja app.current_tenant fijado.';
  END IF;
END;
$$;
