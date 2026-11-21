-- =============================================================================
-- T-329, ADR-0034 — pagos del viajero: el libro de cobro (solo crece), el plazo de cobro por archivo
-- y los días por defecto de la agencia. Sin código de aplicación (eso es T-330).
--
-- Qué hace, en orden:
--   1. El enum `tipo_movimiento_de_cobro` (PAGO, DEVOLUCION, REVERSO, AJUSTE, PENALIDAD): invariante
--      del dominio, no política de la agencia (R12, ADR-0034 §2).
--   2. `travel_files` gana la clave `UNIQUE (id, tenant_id, moneda_iso)` (destino de la foránea del
--      libro, §2.1) y el disparador `travel_files_venta_inmutable` (BEFORE UPDATE): `id`,
--      `tenant_id`, `venta_unidades` y `moneda_iso` no cambian nunca. El saldo se calcula sobre la
--      venta, y la foránea del libro sobre la moneda.
--   3. `pagos`: una fila por movimiento, `tenant_id NOT NULL`, dinero en `bigint` (R8), CHECK por
--      tipo, foráneas COMPUESTAS con el tenant hacia el archivo (con la moneda), el contacto pagador,
--      el usuario que registra y el movimiento reversado (cinco columnas: mismo archivo, agencia,
--      monto y moneda), índice único parcial contra el doble reverso, `UNIQUE (tenant_id,
--      clave_idempotencia)` (R5) y el índice de la ruta caliente.
--   4. `pagos_validar_alta` (BEFORE INSERT): un reverso no reversa a otro reverso, y `registrado_en`
--      es la hora de la sentencia, no la que mande el cliente.
--   5. `pagos_inmutables` (BEFORE UPDATE OR DELETE, y BEFORE TRUNCATE): nadie edita ni borra el libro.
--      Dos salidas, ambas solo para el DUEÑO de la tabla y declaradas en la transacción: la purga de
--      un tenant (`viajapro.purga_de_tenants`, la de `versiones_cotizacion_inmutables`) y el tachado
--      de `nota`/`referencia` (`viajapro.tachado_de_notas`, ADR-0034 §2.4).
--   6. `plazos_de_cobro` (solo inserción, rige la última fila del archivo) y `parametros_de_cobro`
--      (los días por defecto de la agencia; sin fila rigen 30 y nada se siembra).
--   7. RLS habilitada y FORZADA con la política canónica (`aplicar_aislamiento_tenant`) en las tres.
--   8. `privilegios_declarados`, SOLO `viajapro_app`: `pagos` {SELECT, INSERT}, `plazos_de_cobro`
--      {SELECT, INSERT}, `parametros_de_cobro` {SELECT, INSERT, UPDATE}. Nadie más, nadie TRUNCATE.
--   9. Los permisos `cobro.ver`, `cobro.registrar` y `cobro.corregir` (ADR-0034 §6): amplía el CHECK
--      cerrado `roles_permisos_del_catalogo` (once → catorce) y los concede a los roles sembrados de
--      las agencias existentes con separación de funciones: DUENO los tres; ASESOR ver y registrar;
--      OPERACIONES solo ver (supuesto del ADR, sin verificar). Reflejo de `PERMISOS` en
--      `packages/contracts/src/identidad.ts` y de `ROLES_SEMBRADOS` en
--      `packages/database/prisma/siembra-de-tenant.ts` (agencias nuevas). `crear_agencia` NO cambia:
--      solo inserta en `tenants` y no siembra roles.
--  10. Cinturón: todo lo anterior comprobado contra el catálogo.
--
-- **PUNTO B — `tenants.id` es inmutable por diseño, y el disparador no tiene salida para la cascada.**
-- `travel_files_tenant_id_fkey` (y la de cada tabla de agencia, también `pagos`) es
-- `ON UPDATE CASCADE`. PostgreSQL ejecuta esa acción referencial como un `UPDATE` sobre la hija, y
-- ese `UPDATE` SÍ dispara los disparadores de usuario (`BEFORE UPDATE`) de la hija. Así que si alguien
-- cambiara `tenants.id`, `travel_files_venta_inmutable` y `pagos_inmutables` rechazarían la cascada y
-- el `UPDATE` de `tenants` fallaría entero. Se decide que eso es lo CORRECTO y no se abre excepción:
--   (a) Hoy ya es imposible cambiar el id de una agencia con datos, con o sin este disparador: las
--       foráneas compuestas entre tablas de agencia son `ON UPDATE RESTRICT` (usuarios → roles,
--       travel_files → contactos, cotizaciones → contactos, …). La cascada del tenant cambia
--       `roles.tenant_id`, y el RESTRICT de `usuarios` la detiene. Para una agencia con usuarios, la
--       «cascada» hacia las hijas ya es letra muerta.
--   (b) Ningún rol de login puede escribir `tenants` (`excepciones_rls`: {SELECT} para los tres de
--       aplicación; nada para `viajapro_identidad`); los NOLOGIN dueños de funciones solo escriben
--       columnas sueltas (`zona_horaria`, `actualizado_en`) o insertan (`crear_agencia`). El
--       cinturón lo comprueba por columna: ningún rol de login vigilado ni ningún `viajapro_*`
--       (salvo el dueño de `tenants`, el de migraciones) tiene UPDATE sobre `tenants.id`.
--   (c) Una excepción para la cascada (p. ej. `pg_trigger_depth() > 1`) sería una puerta: la acción
--       referencial corre como el DUEÑO de la hija, y cualquier otra acción anidada (un disparador
--       futuro que actualice archivos) pasaría por ella. Lo que no tiene caso de uso no se abre.
--   Lo prueba `aislamiento.spec.ts` («T-329», P-B): ningún rol puede actualizar `tenants.id`, y el
--   dueño que lo intenta sobre una agencia con archivo y pagos recibe un error.
--   Si algún día hiciera falta re-identificar una agencia, es un procedimiento de plataforma con su
--   ADR (copiar a un id nuevo y purgar), no un `UPDATE`.
--
-- **Por qué privilegio Y disparador en `pagos`** (ADR-0034 §5): es dinero. El privilegio
-- ({SELECT, INSERT}) frena a la API; el disparador frena al dueño y sobrevive a una migración futura
-- que amplíe privilegios por error. `plazos_de_cobro` se queda con el privilegio, como
-- `reserva_cambios_estado`.
--
-- **Doble reverso y reverso de reverso, también en carrera.** El doble reverso lo impide el índice
-- único parcial `(tenant_id, reverso_de_id)` (la segunda inserción espera a la primera y choca).
-- El reverso de un reverso lo impide `pagos_validar_alta`, que antes de mirar el tipo del original
-- toma un candado consultivo por archivo (espacio 7410329, hash de tenant y archivo): sin él, un
-- reverso aún sin confirmar no se vería desde otra transacción y el de encima pasaría la mirada.
-- La API toma además su propio candado por archivo (ADR-0034 §4 paso 1); el de la base no lo
-- sustituye, lo respalda, y siempre se toma DESPUÉS del de la API (dentro del INSERT), así que no
-- hay interbloqueo posible entre los dos.
--
-- **`registrado_en` lo fija la base** (`statement_timestamp()`, el mismo criterio que T-375 en
-- `perfiles_de_agencia`). El ADR la declara `DEFAULT now()` como «instante de registro»; un libro de
-- cobro cuyo instante de registro lo elige el cliente no es auditoría. El DEFAULT se conserva.
--
-- **Lo que la base NO garantiza y queda a la API (T-330):** que el contenido de un reintento con la
-- misma clave de idempotencia sea igual (aquí solo la unicidad); el tipo permitido según el estado
-- del archivo (PAGO/AJUSTE en ABIERTO, PENALIDAD en CANCELADO); que `pagado_el` no sea futuro; que
-- una devolución o un reverso no dejen lo pagado en negativo; que un ajuste no deje el total negativo;
-- el filtro Luhn sobre `nota` y `referencia`; y quién puede qué (permisos `cobro.*`).
--
-- **Sin datos de tarjeta, sin PII sensible (R10, ADR-0034 §2.4).** `nota`, `referencia` y `motivo`
-- van en claro bajo RLS; nunca a logs, outbox ni auditoría (lo cuida la API).
--
-- **Segura en caliente (expandir).** Tres tablas y un tipo nuevos. Sobre `travel_files`: un índice
-- único sin CONCURRENTLY (Prisma corre la migración en una transacción; hoy la tabla tiene pocas
-- filas: no hay agencia real, CLAUDE.md §1) que ninguna fila puede violar (`id` ya es único), y un
-- disparador que solo rechaza lo que ningún caso de uso escribe: la API actual actualiza `estado`,
-- los datos de cancelación, `oportunidad_id` y las fechas de auditoría, nunca `id`, `tenant_id`,
-- `venta_unidades` ni `moneda_iso` (y un `UPDATE` que los repite con el mismo valor pasa). El CHECK
-- de permisos entra NOT VALID y se valida aparte; solo AMPLÍA la lista. La API anterior no conoce
-- las tablas nuevas, y filtra los permisos que no conoce (`soloDelCatalogo`), así que un DUEÑO con
-- `cobro.*` sigue entrando. Orden: esta migración ANTES de la API de T-330 (migrar y luego arrancar).
--
-- **REVERSIBLE** con una migración posterior mientras no haya movimientos reales (ADR-0034, «Qué
-- habría que cambiar para revertir esto»), en este orden:
--   UPDATE roles SET permisos = array_remove(array_remove(array_remove(permisos,
--     'cobro.ver'), 'cobro.registrar'), 'cobro.corregir')   -- por agencia, con app.current_tenant
--   reponer roles_permisos_del_catalogo con la lista de once de 20261121110000
--   DELETE FROM privilegios_declarados WHERE tabla IN ('pagos','plazos_de_cobro','parametros_de_cobro');
--   DROP TABLE pagos, plazos_de_cobro, parametros_de_cobro;   -- pagos exige antes DROP TRIGGER
--     pagos_sin_truncate/pagos_inmutables o la purga declarada de cada tenant
--   DROP FUNCTION pagos_validar_alta(), pagos_inmutables();
--   DROP TRIGGER travel_files_venta_inmutable ON travel_files; DROP FUNCTION travel_files_venta_inmutable();
--   DROP INDEX travel_files_id_tenant_id_moneda_iso_key; DROP TYPE tipo_movimiento_de_cobro;
-- Se pierden: los movimientos de cobro, los plazos por archivo, los días por defecto de cada agencia
-- y qué roles propios recibieron `cobro.*`. Con movimientos reales el libro no se borra: se
-- supersede ADR-0034.
--
-- **Supuestos sin verificar** (nada de esto se ejecutó en local: la valida el job
-- `aislamiento-tenants` del CI):
--   · OPERACIONES recibe solo `cobro.ver` (ADR-0034 §6, supuesto del propio ADR).
--   · Que la acción ON UPDATE CASCADE dispara los BEFORE UPDATE de la hija y que las foráneas
--     RESTRICT detienen hoy el cambio de `tenants.id` (comportamiento documentado de PostgreSQL; lo
--     confirma la prueba P-B en CI).
--   · Que un `INSERT` concurrente sobre el índice único parcial espera a la otra transacción y
--     choca al confirmar ella (E4, con dos conexiones en CI).
--   · Plazo legal de conservación del soporte contable (ADR-0034 §2.4): sin verificar con el contador.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipo
--
-- Los cinco movimientos son invariantes del dominio (ADR-0034 §2): ninguna agencia «no tiene»
-- devoluciones. Enum de Postgres y no tabla por agencia (R12). Ampliarlo después es
-- `ALTER TYPE ... ADD VALUE`, sin reescribir.
-- -----------------------------------------------------------------------------
CREATE TYPE "tipo_movimiento_de_cobro" AS ENUM ('PAGO', 'DEVOLUCION', 'REVERSO', 'AJUSTE', 'PENALIDAD');

-- -----------------------------------------------------------------------------
-- 2. `travel_files`: la clave con la moneda y el total inmutable (ADR-0034 §2.1)
-- -----------------------------------------------------------------------------

-- Ninguna fila puede violarla: `id` ya es único (PK y `travel_files_id_tenant_id_key`). Las foráneas
-- existentes siguen apuntando a la de dos columnas.
CREATE UNIQUE INDEX "travel_files_id_tenant_id_moneda_iso_key"
  ON "travel_files" ("id", "tenant_id", "moneda_iso");

-- Sin salida para nadie, tampoco para el dueño ni para la cascada del tenant (PUNTO B del
-- encabezado). Un UPDATE que repite el mismo valor pasa (IS DISTINCT FROM): Prisma puede mandarlo.
-- El mensaje no lleva valores: el error puede acabar en un log.
CREATE OR REPLACE FUNCTION travel_files_venta_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
     OR NEW.venta_unidades IS DISTINCT FROM OLD.venta_unidades
     OR NEW.moneda_iso IS DISTINCT FROM OLD.moneda_iso
  THEN
    RAISE EXCEPTION 'archivo de viaje: el id, la agencia, el total vendido y la moneda no cambian'
      USING ERRCODE = 'restrict_violation',
            HINT = 'Lo que cambie el total va al libro de cobro como AJUSTE (ADR-0034 §2.1).';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION travel_files_venta_inmutable() IS
  'Disparador BEFORE UPDATE de travel_files (T-329, ADR-0034 §2.1): rechaza todo cambio de id, tenant_id, venta_unidades o moneda_iso, también del dueño y de la cascada de tenants (tenants.id es inmutable por diseño). SECURITY INVOKER, search_path vacio.';

REVOKE ALL ON FUNCTION travel_files_venta_inmutable() FROM PUBLIC;

CREATE TRIGGER "travel_files_venta_inmutable"
  BEFORE UPDATE ON "travel_files"
  FOR EACH ROW EXECUTE FUNCTION travel_files_venta_inmutable();

-- -----------------------------------------------------------------------------
-- 3. `pagos` — el libro de movimientos de cobro (ADR-0034 §2)
-- -----------------------------------------------------------------------------
CREATE TABLE "pagos" (
    "id"                 UUID                       NOT NULL,
    "tenant_id"          UUID                       NOT NULL,
    "travel_file_id"     UUID                       NOT NULL,
    "tipo"               "tipo_movimiento_de_cobro" NOT NULL,
    -- R8: unidad mínima de la moneda del archivo (en COP, el peso). Lo que pagó el cliente, no lo
    -- que llegó a la cuenta tras la comisión del medio.
    "monto_unidades"     BIGINT                     NOT NULL,
    -- La del archivo: la impone la foránea compuesta.
    "moneda_iso"         CHAR(3)                    NOT NULL,
    -- R9: fecha de calendario en que el dinero llegó (o salió). Solo PAGO y DEVOLUCION.
    "pagado_el"          DATE,
    -- Catálogo cerrado por CHECK (§2.3). Solo PAGO y DEVOLUCION.
    "medio"              VARCHAR(20),
    -- Quién pagó, si no es el titular. Solo PAGO.
    "pagador_id"         UUID,
    -- Número de transacción o comprobante. Texto, sin adjunto, sin datos de tarjeta (§2.4).
    "referencia"         VARCHAR(100),
    "nota"               VARCHAR(500),
    -- Lo fija el tachado de §2.4, y solo él.
    "nota_tachada_en"    TIMESTAMPTZ(3),
    -- Obligatorio en AJUSTE, PENALIDAD y REVERSO.
    "motivo"             VARCHAR(500),
    -- Solo y siempre en REVERSO.
    "reverso_de_id"      UUID,
    -- R5: la genera el cliente al abrir el formulario y la repite en cada reintento (§4).
    "clave_idempotencia" UUID                       NOT NULL,
    "registrado_por"     UUID                       NOT NULL,
    -- UTC (R9). Lo fija `pagos_validar_alta` con la hora de la sentencia; el DEFAULT es de cortesía.
    "registrado_en"      TIMESTAMPTZ(3)             NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagos_moneda_iso" CHECK ("moneda_iso" ~ '^[A-Z]{3}$'),
    -- Valor absoluto entre 1 y 10^15 - 1 (sin abs(): abs(-2^63) desborda). Negativo solo en AJUSTE
    -- (descuento) y en el REVERSO que copia un descuento: la foránea del reverso exige el mismo
    -- monto que el original, y el original negativo solo puede ser un AJUSTE.
    CONSTRAINT "pagos_monto_por_tipo" CHECK (
      "monto_unidades" BETWEEN -999999999999999 AND 999999999999999
      AND "monto_unidades" <> 0
      AND ("monto_unidades" > 0 OR "tipo" IN ('AJUSTE', 'REVERSO'))
    ),
    CONSTRAINT "pagos_fecha_y_medio_por_tipo" CHECK (
      ("tipo" IN ('PAGO', 'DEVOLUCION')) = ("pagado_el" IS NOT NULL)
      AND ("tipo" IN ('PAGO', 'DEVOLUCION')) = ("medio" IS NOT NULL)
    ),
    CONSTRAINT "pagos_medio_del_catalogo" CHECK (
      "medio" IS NULL OR "medio" IN (
        'TRANSFERENCIA', 'EFECTIVO', 'TARJETA', 'CONSIGNACION',
        'BILLETERA_DIGITAL', 'PSE', 'LINK_DE_PAGO', 'OTRO'
      )
    ),
    CONSTRAINT "pagos_pagador_solo_en_pago" CHECK ("pagador_id" IS NULL OR "tipo" = 'PAGO'),
    CONSTRAINT "pagos_motivo_por_tipo" CHECK (
      "tipo" NOT IN ('AJUSTE', 'PENALIDAD', 'REVERSO')
      OR length(btrim(COALESCE("motivo", ''))) > 0
    ),
    CONSTRAINT "pagos_reverso_solo_en_reverso" CHECK (("tipo" = 'REVERSO') = ("reverso_de_id" IS NOT NULL)),
    -- Sin esto, un REVERSO que se apunta a sí mismo cumpliría su propia foránea (misma fila) y el
    -- disparador de alta no lo vería (la fila aún no existe cuando mira).
    CONSTRAINT "pagos_reverso_no_a_si_mismo" CHECK ("reverso_de_id" IS DISTINCT FROM "id"),
    -- Tachada implica sin nota ni referencia.
    CONSTRAINT "pagos_tachado_sin_texto" CHECK (
      "nota_tachada_en" IS NULL OR ("nota" IS NULL AND "referencia" IS NULL)
    )
);

COMMENT ON TABLE "pagos" IS
  'Libro de movimientos de cobro del archivo de viaje (ADR-0034 §2, T-329): PAGO, DEVOLUCION, AJUSTE, PENALIDAD y REVERSO. Solo crece: viajapro_app tiene SELECT e INSERT y pagos_inmutables rechaza UPDATE, DELETE y TRUNCATE (salvo purga declarada y tachado de nota). El saldo se calcula, nunca se guarda. nota, referencia y motivo nunca a logs, outbox ni auditoria.';
COMMENT ON COLUMN "pagos"."monto_unidades" IS
  'Unidad mínima de la moneda (R8). Valor absoluto 1..999999999999999; negativo solo en AJUSTE (descuento) y en el REVERSO de un descuento.';
COMMENT ON COLUMN "pagos"."nota" IS
  'Texto libre de la agencia, en claro bajo RLS (no es PII sensible, ADR-0034 §2.4). Sin datos de tarjeta (filtro Luhn en la API). Se tacha por procedimiento de operación, nunca por la API.';
COMMENT ON COLUMN "pagos"."referencia" IS
  'Número de transacción o comprobante. Mismo tratamiento que nota.';

-- Destino de las foráneas compuestas que vengan después.
CREATE UNIQUE INDEX "pagos_id_tenant_id_key" ON "pagos" ("id", "tenant_id");
-- Destino de la foránea del reverso: mismo archivo, agencia, monto y moneda que el original.
CREATE UNIQUE INDEX "pagos_id_tenant_id_travel_file_id_monto_unidades_moneda_iso_key"
  ON "pagos" ("id", "tenant_id", "travel_file_id", "monto_unidades", "moneda_iso");
-- R5: la misma clave dos veces en la agencia no crea dos movimientos. Por agencia, no global.
CREATE UNIQUE INDEX "pagos_tenant_id_clave_idempotencia_key"
  ON "pagos" ("tenant_id", "clave_idempotencia");
-- Un movimiento se reversa UNA sola vez. Prisma no modela índices parciales.
CREATE UNIQUE INDEX "pagos_un_reverso_por_movimiento"
  ON "pagos" ("tenant_id", "reverso_de_id") WHERE "reverso_de_id" IS NOT NULL;
-- La ruta caliente: el historial de un archivo y la suma agrupada de la vista (T-332).
CREATE INDEX "pagos_tenant_id_travel_file_id_registrado_en_id_idx"
  ON "pagos" ("tenant_id", "travel_file_id", "registrado_en", "id");
-- La comprobación de la foránea del pagador al borrar un contacto (solo la purga).
CREATE INDEX "pagos_tenant_id_pagador_id_idx" ON "pagos" ("tenant_id", "pagador_id");

ALTER TABLE "pagos" ADD CONSTRAINT "pagos_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Archivo de ESTA agencia y en SU moneda (§2.1). NO ACTION y no RESTRICT al borrar: la cascada del
-- tenant se lleva archivo y movimientos en la misma sentencia (mismo motivo que 20261115150000).
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_travel_file_id_tenant_id_moneda_iso_fkey"
  FOREIGN KEY ("travel_file_id", "tenant_id", "moneda_iso")
  REFERENCES "travel_files" ("id", "tenant_id", "moneda_iso")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
-- El reverso, atado al original por cinco columnas. MATCH SIMPLE: con reverso_de_id nulo no comprueba.
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_reverso_de_id_fkey"
  FOREIGN KEY ("reverso_de_id", "tenant_id", "travel_file_id", "monto_unidades", "moneda_iso")
  REFERENCES "pagos" ("id", "tenant_id", "travel_file_id", "monto_unidades", "moneda_iso")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_pagador_id_tenant_id_fkey"
  FOREIGN KEY ("pagador_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "pagos" ADD CONSTRAINT "pagos_registrado_por_tenant_id_fkey"
  FOREIGN KEY ("registrado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 4 y 5. Los disparadores del libro
--
-- Ninguno es SECURITY DEFINER: corren con el rol de quien escribe, bajo su RLS. Un disparador no
-- necesita EXECUTE para dispararse: se revoca a PUBLIC sin conceder a nadie.
-- -----------------------------------------------------------------------------

-- 4. El alta.
CREATE OR REPLACE FUNCTION pagos_validar_alta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  c_espacio_del_cobro constant pg_catalog.int4 := 7410329;
  v_tipo_original public.tipo_movimiento_de_cobro;
BEGIN
  NEW.registrado_en := pg_catalog.statement_timestamp();

  IF NEW.tipo = 'REVERSO' THEN
    -- El candado por archivo ANTES de mirar: un reverso de otra transacción todavía sin confirmar
    -- no se vería, y el reverso de encima pasaría. Con el candado, esta inserción espera a que la
    -- otra confirme y la consulta de abajo (instantánea nueva, READ COMMITTED) la ve.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      c_espacio_del_cobro,
      pg_catalog.hashtext(NEW.tenant_id::text || ':' || NEW.travel_file_id::text));

    SELECT p.tipo INTO v_tipo_original
      FROM public.pagos p
     WHERE p.id = NEW.reverso_de_id
       AND p.tenant_id = NEW.tenant_id;

    IF v_tipo_original = 'REVERSO' THEN
      RAISE EXCEPTION 'libro de cobro: un reverso no se reversa'
        USING ERRCODE = 'check_violation',
              HINT = 'Para corregir un reverso equivocado, registre el movimiento correcto.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION pagos_validar_alta() IS
  'Disparador BEFORE INSERT de pagos (T-329, ADR-0034 §2.1): registrado_en es la hora de la sentencia; un REVERSO no apunta a otro REVERSO (con candado consultivo por archivo, espacio 7410329, para que valga en carrera). SECURITY INVOKER, search_path vacio.';

-- 5. La inmutabilidad: ni UPDATE, ni DELETE, ni TRUNCATE. Dos salidas, y las dos exigen ser el
-- PROPIETARIO de la tabla (ningún rol de aplicación lo es ni puede serlo) y haberlo declarado en
-- ESTA transacción:
--   · la purga de la agencia entera (Ley 1581: supresión), como `versiones_cotizacion_inmutables`:
--       SELECT set_config('viajapro.purga_de_tenants', '<uuid>,<uuid>', true);
--     Ojo: una acción referencial en cascada corre como propietario; la única que llega a borrar
--     esta tabla es la de `tenants`, que ningún rol de aplicación puede borrar.
--   · el tachado de §2.4: `nota` y `referencia` a nulo, `nota_tachada_en` fijado (la base lo pone a
--     la hora de la sentencia) y TODO lo demás igual, comparando la fila entera menos esas tres
--     columnas (también las que se añadan mañana). Una sola vez por movimiento:
--       SELECT set_config('viajapro.tachado_de_notas', '<uuid>,<uuid>', true);
-- La cascada ON UPDATE de `tenants` llega aquí como UPDATE del propietario y cambia `tenant_id`: no
-- es un tachado y se rechaza (PUNTO B del encabezado).
CREATE OR REPLACE FUNCTION pagos_inmutables()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_es_dueno boolean;
BEGIN
  IF TG_LEVEL = 'ROW' THEN
    v_es_dueno := current_user = (SELECT pg_catalog.pg_get_userbyid(c.relowner)
                                    FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID);

    IF TG_OP = 'DELETE' THEN
      IF v_es_dueno
         AND OLD.tenant_id::text = ANY (pg_catalog.string_to_array(
               pg_catalog.current_setting('viajapro.purga_de_tenants', true), ','))
      THEN
        RETURN OLD;
      END IF;
    ELSIF TG_OP = 'UPDATE' THEN
      IF v_es_dueno
         AND OLD.id::text = ANY (pg_catalog.string_to_array(
               pg_catalog.current_setting('viajapro.tachado_de_notas', true), ','))
         AND OLD.nota_tachada_en IS NULL
         AND NEW.nota IS NULL
         AND NEW.referencia IS NULL
         AND NEW.nota_tachada_en IS NOT NULL
         AND (pg_catalog.to_jsonb(NEW) - 'nota' - 'referencia' - 'nota_tachada_en')
             = (pg_catalog.to_jsonb(OLD) - 'nota' - 'referencia' - 'nota_tachada_en')
      THEN
        NEW.nota_tachada_en := pg_catalog.statement_timestamp();
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  RAISE EXCEPTION 'libro de cobro inmutable: % rechazado', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Un movimiento no se edita ni se borra: se reversa y se registra el correcto.';
END;
$$;

COMMENT ON FUNCTION pagos_inmutables() IS
  'Disparador BEFORE UPDATE OR DELETE y BEFORE TRUNCATE de pagos (T-329, ADR-0034 §5): rechaza todo, salvo para el dueño de la tabla la purga declarada en viajapro.purga_de_tenants y el tachado de nota/referencia declarado en viajapro.tachado_de_notas (§2.4). SECURITY INVOKER, search_path vacio.';

REVOKE ALL ON FUNCTION pagos_validar_alta() FROM PUBLIC;
REVOKE ALL ON FUNCTION pagos_inmutables() FROM PUBLIC;

CREATE TRIGGER "pagos_validar_alta"
  BEFORE INSERT ON "pagos"
  FOR EACH ROW EXECUTE FUNCTION pagos_validar_alta();

CREATE TRIGGER "pagos_inmutables"
  BEFORE UPDATE OR DELETE ON "pagos"
  FOR EACH ROW EXECUTE FUNCTION pagos_inmutables();

CREATE TRIGGER "pagos_sin_truncate"
  BEFORE TRUNCATE ON "pagos"
  FOR EACH STATEMENT EXECUTE FUNCTION pagos_inmutables();

-- -----------------------------------------------------------------------------
-- 6a. `plazos_de_cobro` — la fecha límite de cobro de un archivo, solo inserción (ADR-0034 §3)
--
-- Rige la última fila del archivo (registrado_en, id); sin filas, la fecha por defecto que calcula
-- el dominio. Sin disparador: basta el privilegio, como `reserva_cambios_estado`.
-- -----------------------------------------------------------------------------
CREATE TABLE "plazos_de_cobro" (
    "id"             UUID           NOT NULL,
    "tenant_id"      UUID           NOT NULL,
    "travel_file_id" UUID           NOT NULL,
    -- R9: fecha de calendario, `date`.
    "vence_el"       DATE           NOT NULL,
    "motivo"         VARCHAR(200),
    "registrado_por" UUID           NOT NULL,
    "registrado_en"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plazos_de_cobro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plazos_de_cobro_motivo_no_vacio"
      CHECK ("motivo" IS NULL OR length(btrim("motivo")) > 0)
);

COMMENT ON TABLE "plazos_de_cobro" IS
  'Fecha límite de cobro de un archivo fijada a mano (collectionDueDate, ADR-0034 §3, T-329). Solo inserción: rige la última fila del archivo. motivo nunca a logs, outbox ni auditoria.';

CREATE UNIQUE INDEX "plazos_de_cobro_id_tenant_id_key" ON "plazos_de_cobro" ("id", "tenant_id");
-- «La última del archivo»: recorrido hacia atrás.
CREATE INDEX "plazos_de_cobro_tenant_id_travel_file_id_registrado_en_id_idx"
  ON "plazos_de_cobro" ("tenant_id", "travel_file_id", "registrado_en", "id");

ALTER TABLE "plazos_de_cobro" ADD CONSTRAINT "plazos_de_cobro_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plazos_de_cobro" ADD CONSTRAINT "plazos_de_cobro_travel_file_id_tenant_id_fkey"
  FOREIGN KEY ("travel_file_id", "tenant_id") REFERENCES "travel_files" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "plazos_de_cobro" ADD CONSTRAINT "plazos_de_cobro_registrado_por_tenant_id_fkey"
  FOREIGN KEY ("registrado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 6b. `parametros_de_cobro` — los días por defecto de la agencia (ADR-0034 §3, R12)
--
-- Una fila por agencia o ninguna (rigen 30 días): ni la siembra de tenant ni `crear_agencia`
-- cambian. La edita quien tenga `cobro.corregir` (PUT /cobros/parametros, upsert).
-- -----------------------------------------------------------------------------
CREATE TABLE "parametros_de_cobro" (
    "tenant_id"           UUID           NOT NULL,
    "dias_plazo_de_cobro" SMALLINT       NOT NULL,
    "actualizado_por"     UUID           NOT NULL,
    "actualizado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parametros_de_cobro_pkey" PRIMARY KEY ("tenant_id"),
    CONSTRAINT "parametros_de_cobro_dias_en_rango" CHECK ("dias_plazo_de_cobro" BETWEEN 0 AND 365)
);

COMMENT ON TABLE "parametros_de_cobro" IS
  'Política de cobro de la agencia (ADR-0034 §3, T-329): días antes de la salida en que vence el cobro por defecto. Sin fila rigen 30.';

ALTER TABLE "parametros_de_cobro" ADD CONSTRAINT "parametros_de_cobro_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "parametros_de_cobro" ADD CONSTRAINT "parametros_de_cobro_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 7. RLS habilitada y forzada, política canónica con USING y WITH CHECK
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('pagos');
SELECT aplicar_aislamiento_tenant('plazos_de_cobro');
SELECT aplicar_aislamiento_tenant('parametros_de_cobro');

-- -----------------------------------------------------------------------------
-- 8. Privilegios declarados (ADR-0024 §5.2, ADR-0034 §5): solo `viajapro_app`
-- -----------------------------------------------------------------------------
INSERT INTO privilegios_declarados (tabla, rol, privilegios, motivo) VALUES
  ('pagos', 'viajapro_app', '{SELECT,INSERT}',
   'T-329 (ADR-0034 §5): la API registra movimientos de cobro y los lee, bajo RLS. Sin UPDATE, DELETE ni TRUNCATE: el libro solo crece (además, el disparador pagos_inmutables).'),
  ('plazos_de_cobro', 'viajapro_app', '{SELECT,INSERT}',
   'T-329 (ADR-0034 §3): la API fija la fecha límite de cobro de un archivo insertando; rige la última. Sin UPDATE ni DELETE.'),
  ('parametros_de_cobro', 'viajapro_app', '{SELECT,INSERT,UPDATE}',
   'T-329 (ADR-0034 §3): la API lee y fija (upsert) los días por defecto de la agencia. Sin DELETE.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 9. Los permisos `cobro.*`: catálogo cerrado con catorce, y a los roles sembrados
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
    'cobro.corregir'
  ]::text[]
  AND array_position("permisos", NULL) IS NULL
) NOT VALID;

ALTER TABLE "roles" VALIDATE CONSTRAINT "roles_permisos_del_catalogo";

-- Separación de funciones (ADR-0034 §6): el asesor registra pagos pero no los compensa. Solo los
-- roles sembrados (con `clave`); los que creó la agencia no se tocan: cómo los compone es suya.
-- Agencia por agencia con `app.current_tenant`: `roles` tiene RLS FORZADA y, con un rol de
-- migraciones sin BYPASSRLS, un UPDATE sin contexto vería cero filas y terminaría en verde.
-- Las marcas [relleno-cobro] las usa `aislamiento.spec.ts` («T-329», P-PERM) para reejecutar
-- este bloque sobre una agencia de prueba: no las muevas sin mover la prueba.
-- [relleno-cobro]
DO $$
DECLARE
  t record;
  faltan integer;
  duplicados integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    UPDATE "roles" r
       SET "permisos" = r."permisos" || ARRAY(
             SELECT p FROM unnest(m.nuevos) WITH ORDINALITY AS n(p, i)
              WHERE NOT (p = ANY (r."permisos"))
              ORDER BY i
           ),
           "actualizado_en" = now()
      FROM (VALUES
        ('DUENO',       ARRAY['cobro.ver', 'cobro.registrar', 'cobro.corregir']),
        ('ASESOR',      ARRAY['cobro.ver', 'cobro.registrar']),
        ('OPERACIONES', ARRAY['cobro.ver'])
      ) AS m(clave, nuevos)
     WHERE r."tenant_id" = t.id
       AND r."clave" = m.clave
       AND NOT (r."permisos" @> m.nuevos);

    SELECT count(*) FILTER (WHERE NOT (r."permisos" @> m.nuevos)),
           count(*) FILTER (
             WHERE cardinality(r."permisos") <> (SELECT count(DISTINCT x) FROM unnest(r."permisos") x)
           )
      INTO faltan, duplicados
      FROM "roles" r
      JOIN (VALUES
        ('DUENO',       ARRAY['cobro.ver', 'cobro.registrar', 'cobro.corregir']),
        ('ASESOR',      ARRAY['cobro.ver', 'cobro.registrar']),
        ('OPERACIONES', ARRAY['cobro.ver'])
      ) AS m(clave, nuevos) ON m.clave = r."clave"
     WHERE r."tenant_id" = t.id;
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) sembrado(s) sin sus permisos cobro.*.', t.id, faltan;
    END IF;
    IF duplicados > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con % rol(es) sembrado(s) con permisos duplicados.', t.id, duplicados;
    END IF;
  END LOOP;

  -- El contexto no sobrevive a la migración.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;
-- [/relleno-cobro]

-- `roles` no cambia de forma, pero se reaplica: idempotente (mismo idioma que 20261121110000).
SELECT aplicar_aislamiento_tenant('roles');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 10. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
--
-- Las mismas propiedades, de comportamiento, en `tests/aislamiento.spec.ts` («T-329»).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_tabla text;
  v_rol text;
  v_fn text;
  v_fuente text;
  v_tenant uuid;
  v_puede boolean;
  faltan integer;
  reales text[];
  esperados text[];
  tablas constant text[] := ARRAY['pagos', 'plazos_de_cobro', 'parametros_de_cobro'];
  funciones constant text[] := ARRAY['pagos_validar_alta', 'pagos_inmutables', 'travel_files_venta_inmutable'];
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- --- Las tres tablas: aislamiento y matriz de privilegios -------------------
  FOREACH v_tabla IN ARRAY tablas LOOP
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
             WHERE oid = format('public.%I', v_tabla)::regclass) THEN
      RAISE EXCEPTION '% no tiene RLS habilitada y forzada.', v_tabla;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy p
                    WHERE p.polrelid = format('public.%I', v_tabla)::regclass
                      AND p.polname = 'tenant_isolation'
                      AND p.polcmd = '*'
                      AND p.polpermissive
                      AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
                      AND pg_get_expr(p.polqual, p.polrelid) = pg_get_expr(p.polwithcheck, p.polrelid)) THEN
      RAISE EXCEPTION '% no tiene la política tenant_isolation FOR ALL con USING y WITH CHECK iguales.', v_tabla;
    END IF;
    -- Ninguna otra política: una permisiva más ampliaría lo visible por OR.
    IF (SELECT count(*) FROM pg_policy p WHERE p.polrelid = format('public.%I', v_tabla)::regclass) <> 1 THEN
      RAISE EXCEPTION '% tiene políticas además de tenant_isolation.', v_tabla;
    END IF;
    IF NOT (SELECT a.attnotnull FROM pg_attribute a
             WHERE a.attrelid = format('public.%I', v_tabla)::regclass
               AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
      RAISE EXCEPTION '%.tenant_id admite nulos.', v_tabla;
    END IF;
    IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = v_tabla) THEN
      RAISE EXCEPTION '% no puede ser una excepción de RLS.', v_tabla;
    END IF;

    FOR v_rol IN
      SELECT rolname FROM roles_de_login_vigilados
      UNION
      SELECT rolname FROM pg_roles
       WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
    LOOP
      SELECT COALESCE(array_agg(p ORDER BY p), '{}')
        INTO reales
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
       WHERE has_table_privilege(v_rol, format('public.%I', v_tabla), p);
      esperados := CASE
        WHEN v_rol <> 'viajapro_app' THEN '{}'::text[]
        WHEN v_tabla = 'parametros_de_cobro' THEN ARRAY['INSERT', 'SELECT', 'UPDATE']
        ELSE ARRAY['INSERT', 'SELECT']
      END;
      IF reales IS DISTINCT FROM esperados THEN
        RAISE EXCEPTION 'Privilegios de % sobre %: % (se esperaba %).', v_rol, v_tabla, reales, esperados;
      END IF;
      IF v_rol <> 'viajapro_app'
         AND (has_any_column_privilege(v_rol, format('public.%I', v_tabla), 'SELECT')
              OR has_any_column_privilege(v_rol, format('public.%I', v_tabla), 'INSERT')
              OR has_any_column_privilege(v_rol, format('public.%I', v_tabla), 'UPDATE')) THEN
        RAISE EXCEPTION '% tiene privilegios de columna sobre %.', v_rol, v_tabla;
      END IF;
      -- Tampoco UPDATE por columna para la API donde no lo tiene por tabla (pagos, plazos).
      IF v_rol = 'viajapro_app' AND v_tabla <> 'parametros_de_cobro'
         AND has_any_column_privilege(v_rol, format('public.%I', v_tabla), 'UPDATE') THEN
        RAISE EXCEPTION 'viajapro_app tiene UPDATE de columna sobre %.', v_tabla;
      END IF;
    END LOOP;

    IF has_table_privilege('public', format('public.%I', v_tabla), 'SELECT') THEN
      RAISE EXCEPTION 'PUBLIC puede leer %.', v_tabla;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM privilegios_declarados d JOIN excepciones_rls e ON e.tabla = d.tabla) THEN
    RAISE EXCEPTION 'Una tabla está a la vez en excepciones_rls y en privilegios_declarados.';
  END IF;
  IF (SELECT count(*) FROM privilegios_declarados
       WHERE tabla = ANY (tablas) AND rol <> 'viajapro_app') <> 0 THEN
    RAISE EXCEPTION 'privilegios_declarados concede las tablas de cobro a un rol distinto de viajapro_app.';
  END IF;

  -- --- Foráneas: toda la que toca estas tablas empareja el tenant; las cruciales, exactas -------
  SELECT string_agg(DISTINCT t.relname || '.' || c.conname, ', ')
    INTO defectos
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class p ON p.oid = c.confrelid
    JOIN pg_attribute ta ON ta.attrelid = c.conrelid AND ta.attname = 'tenant_id'
                        AND ta.attnum > 0 AND NOT ta.attisdropped
    JOIN pg_attribute pa ON pa.attrelid = c.confrelid AND pa.attname = 'tenant_id'
                        AND pa.attnum > 0 AND NOT pa.attisdropped
   WHERE c.contype = 'f'
     AND (t.relname = ANY (tablas) OR p.relname = ANY (tablas))
     AND NOT EXISTS (
       SELECT 1 FROM generate_subscripts(c.conkey, 1) AS i
        WHERE c.conkey[i] = ta.attnum AND c.confkey[i] = pa.attnum
     );
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Foráneas que no incluyen tenant_id: %', defectos;
  END IF;

  SELECT string_agg(e.nombre, ', ')
    INTO defectos
    FROM (VALUES
      ('pagos_travel_file_id_tenant_id_moneda_iso_fkey', 'pagos', 'travel_files',
       ARRAY['travel_file_id', 'tenant_id', 'moneda_iso'], ARRAY['id', 'tenant_id', 'moneda_iso']),
      ('pagos_reverso_de_id_fkey', 'pagos', 'pagos',
       ARRAY['reverso_de_id', 'tenant_id', 'travel_file_id', 'monto_unidades', 'moneda_iso'],
       ARRAY['id', 'tenant_id', 'travel_file_id', 'monto_unidades', 'moneda_iso']),
      ('pagos_pagador_id_tenant_id_fkey', 'pagos', 'contactos',
       ARRAY['pagador_id', 'tenant_id'], ARRAY['id', 'tenant_id']),
      ('pagos_registrado_por_tenant_id_fkey', 'pagos', 'usuarios',
       ARRAY['registrado_por', 'tenant_id'], ARRAY['id', 'tenant_id']),
      ('plazos_de_cobro_travel_file_id_tenant_id_fkey', 'plazos_de_cobro', 'travel_files',
       ARRAY['travel_file_id', 'tenant_id'], ARRAY['id', 'tenant_id']),
      ('plazos_de_cobro_registrado_por_tenant_id_fkey', 'plazos_de_cobro', 'usuarios',
       ARRAY['registrado_por', 'tenant_id'], ARRAY['id', 'tenant_id']),
      ('parametros_de_cobro_actualizado_por_tenant_id_fkey', 'parametros_de_cobro', 'usuarios',
       ARRAY['actualizado_por', 'tenant_id'], ARRAY['id', 'tenant_id'])
    ) AS e(nombre, hija, padre, columnas, destino)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_constraint c
      WHERE c.conname = e.nombre
        AND c.contype = 'f'
        AND c.convalidated
        AND c.conrelid = format('public.%I', e.hija)::regclass
        AND c.confrelid = format('public.%I', e.padre)::regclass
        AND c.confmatchtype = 's'
        AND (SELECT array_agg(a.attname::text ORDER BY i)
               FROM generate_subscripts(c.conkey, 1) AS i
               JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[i]) = e.columnas
        AND (SELECT array_agg(a.attname::text ORDER BY i)
               FROM generate_subscripts(c.confkey, 1) AS i
               JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = c.confkey[i]) = e.destino
   );
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Foráneas compuestas ausentes, distintas o sin validar: %', defectos;
  END IF;

  -- --- Índices únicos: la clave nueva del archivo, idempotencia y el reverso único ---------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = 'public.travel_files_id_tenant_id_moneda_iso_key'::regclass
       AND i.indrelid = 'public.travel_files'::regclass
       AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
       AND (SELECT array_agg(a.attname::text ORDER BY k.n)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, n)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
           = ARRAY['id', 'tenant_id', 'moneda_iso']
  ) THEN
    RAISE EXCEPTION 'Falta la clave única (id, tenant_id, moneda_iso) de travel_files.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = 'public.pagos_tenant_id_clave_idempotencia_key'::regclass
       AND i.indrelid = 'public.pagos'::regclass
       AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
       AND (SELECT array_agg(a.attname::text ORDER BY k.n)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, n)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
           = ARRAY['tenant_id', 'clave_idempotencia']
  ) THEN
    RAISE EXCEPTION 'Falta la unicidad (tenant_id, clave_idempotencia) de pagos.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = 'public.pagos_un_reverso_por_movimiento'::regclass
       AND i.indrelid = 'public.pagos'::regclass
       AND i.indisunique AND i.indisvalid
       AND (SELECT array_agg(a.attname::text ORDER BY k.n)
              FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, n)
              JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum)
           = ARRAY['tenant_id', 'reverso_de_id']
       AND pg_get_expr(i.indpred, i.indrelid) ~ '^\(?reverso_de_id IS NOT NULL\)?$'
  ) THEN
    RAISE EXCEPTION 'Falta el índice único parcial (tenant_id, reverso_de_id) WHERE reverso_de_id IS NOT NULL de pagos.';
  END IF;

  -- --- Las tres funciones: SECURITY INVOKER, proconfig EXACTAMENTE search_path vacío, sin EXECUTE --
  FOREACH v_fn IN ARRAY funciones LOOP
    IF EXISTS (
      SELECT 1 FROM pg_proc p
       WHERE p.oid = format('public.%I()', v_fn)::regprocedure
         AND (p.prosecdef
              OR p.proconfig IS NULL
              OR NOT (p.proconfig = ARRAY['search_path=""'] OR p.proconfig = ARRAY['search_path=']))
    ) THEN
      RAISE EXCEPTION '% debe ser SECURITY INVOKER y su proconfig exactamente search_path vacío.', v_fn;
    END IF;
    IF has_function_privilege('public', format('public.%I()', v_fn), 'EXECUTE') THEN
      RAISE EXCEPTION 'PUBLIC puede ejecutar %.', v_fn;
    END IF;
    FOR v_rol IN
      SELECT rolname FROM roles_de_login_vigilados
      UNION
      SELECT rolname FROM pg_roles
       WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
    LOOP
      IF has_function_privilege(v_rol, format('public.%I()', v_fn), 'EXECUTE') THEN
        RAISE EXCEPTION '% puede ejecutar %.', v_rol, v_fn;
      END IF;
    END LOOP;
  END LOOP;

  -- Cuerpos: sin salidas de más.
  SELECT p.prosrc INTO v_fuente FROM pg_proc p WHERE p.oid = 'public.travel_files_venta_inmutable()'::regprocedure;
  IF pg_catalog.regexp_count(v_fuente, 'NEW\.(id|tenant_id|venta_unidades|moneda_iso) IS DISTINCT FROM OLD\.\1') <> 4
     OR v_fuente ~* '(current_user|session_user|current_setting|pg_trigger_depth)' THEN
    RAISE EXCEPTION 'travel_files_venta_inmutable debe comparar id, tenant_id, venta_unidades y moneda_iso, sin ninguna salida.';
  END IF;
  SELECT p.prosrc INTO v_fuente FROM pg_proc p WHERE p.oid = 'public.pagos_inmutables()'::regprocedure;
  IF pg_catalog.regexp_count(v_fuente, 'RETURN (OLD|NEW);') <> 2
     OR pg_catalog.regexp_count(v_fuente, 'viajapro\.purga_de_tenants') <> 1
     OR pg_catalog.regexp_count(v_fuente, 'viajapro\.tachado_de_notas') <> 1
     OR pg_catalog.regexp_count(v_fuente, 'v_es_dueno\s+AND') <> 2 THEN
    RAISE EXCEPTION 'pagos_inmutables debe tener exactamente dos salidas (purga y tachado), ambas solo para el dueño.';
  END IF;
  SELECT p.prosrc INTO v_fuente FROM pg_proc p WHERE p.oid = 'public.pagos_validar_alta()'::regprocedure;
  IF v_fuente !~ 'pg_catalog\.pg_advisory_xact_lock\(\s*c_espacio_del_cobro'
     OR v_fuente !~ 'NEW\.registrado_en := pg_catalog\.statement_timestamp\(\);' THEN
    RAISE EXCEPTION 'pagos_validar_alta debe tomar el candado por archivo y fijar registrado_en.';
  END IF;

  -- --- Los disparadores: existen, HABILITADOS (tgenabled = 'O'), sin WHEN ni columnas, con su función
  -- tgtype: 1 fila, 2 BEFORE, 4 INSERT, 8 DELETE, 16 UPDATE, 32 TRUNCATE.
  SELECT string_agg(e.nombre, ', ')
    INTO defectos
    FROM (VALUES
      ('pagos_validar_alta', 'pagos', 'pagos_validar_alta', 7),
      ('pagos_inmutables', 'pagos', 'pagos_inmutables', 27),
      ('pagos_sin_truncate', 'pagos', 'pagos_inmutables', 34),
      ('travel_files_venta_inmutable', 'travel_files', 'travel_files_venta_inmutable', 19)
    ) AS e(nombre, tabla, funcion, tipo)
   WHERE NOT EXISTS (
     SELECT 1 FROM pg_trigger t
      WHERE t.tgname = e.nombre
        AND t.tgrelid = format('public.%I', e.tabla)::regclass
        AND NOT t.tgisinternal
        AND t.tgenabled = 'O'
        AND t.tgtype = e.tipo
        AND t.tgqual IS NULL
        AND cardinality(t.tgattr::int2[]) = 0
        AND t.tgfoid = format('public.%I()', e.funcion)::regprocedure
   );
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Disparadores ausentes, deshabilitados o distintos de lo declarado: %', defectos;
  END IF;
  -- En `pagos`, esos tres y ninguno más (uno deshabilitado o uno nuevo sería otra historia).
  IF (SELECT count(*) FROM pg_trigger t
       WHERE t.tgrelid = 'public.pagos'::regclass AND NOT t.tgisinternal) <> 3 THEN
    RAISE EXCEPTION 'pagos tiene disparadores de usuario distintos de los tres declarados.';
  END IF;
  -- `session_replication_role = replica` apaga los disparadores 'O' (y las foráneas). Es de
  -- superusuario, pero desde PG 15 se puede conceder con GRANT SET ON PARAMETER: ningún rol de login.
  IF current_setting('server_version_num')::int >= 150000 THEN
    FOR v_rol IN
      SELECT rolname FROM roles_de_login_vigilados
      UNION
      SELECT rolname FROM pg_roles
       WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
    LOOP
      EXECUTE 'SELECT has_parameter_privilege($1, ''session_replication_role'', ''SET'')'
        INTO STRICT v_puede USING v_rol;
      IF v_puede THEN
        RAISE EXCEPTION '% puede fijar session_replication_role: apagaría los disparadores del libro.', v_rol;
      END IF;
    END LOOP;
  END IF;

  -- --- PUNTO B: ningún rol del sistema (los de login vigilados y todo `viajapro_*`, también los
  -- NOLOGIN dueños de funciones) puede actualizar `tenants.id`, ni por tabla ni por columna. Solo
  -- se exceptúa al dueño de `tenants` (el rol de migraciones). has_column_privilege sigue la
  -- pertenencia: un rol miembro del dueño, o de pg_write_all_data, sale aquí. No se barren los
  -- roles ajenos del proveedor (Neon): no son del sistema y no se pueden gobernar desde aquí.
  SELECT string_agg(r.rolname, ', ' ORDER BY r.rolname)
    INTO defectos
    FROM pg_roles r
    JOIN pg_class c ON c.oid = 'public.tenants'::regclass
   WHERE (r.rolname LIKE 'viajapro\_%'
          OR r.rolname IN (SELECT rolname FROM roles_de_login_vigilados))
     AND r.oid <> c.relowner
     AND has_column_privilege(r.oid, c.oid, 'id', 'UPDATE');
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Roles que pueden actualizar tenants.id (es inmutable por diseño, T-329 PUNTO B): %', defectos;
  END IF;

  -- --- El catálogo de permisos y la siembra (separación de funciones) ----------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = '"roles"'::regclass
       AND conname = 'roles_permisos_del_catalogo'
       AND convalidated
       AND pg_get_constraintdef(oid) LIKE '%''cobro.ver''%'
       AND pg_get_constraintdef(oid) LIKE '%''cobro.registrar''%'
       AND pg_get_constraintdef(oid) LIKE '%''cobro.corregir''%'
  ) THEN
    RAISE EXCEPTION 'roles_permisos_del_catalogo no quedó validado con cobro.ver, cobro.registrar y cobro.corregir.';
  END IF;

  -- Ningún rol sembrado ASESOR u OPERACIONES con lo que no le toca. Antes de esta migración nadie
  -- podía tener `cobro.*` (el CHECK no lo admitía), así que esto solo mira lo que hizo el relleno.
  FOR v_tenant IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', v_tenant::text, true);
    SELECT count(*) INTO faltan
      FROM "roles" r
     WHERE r."tenant_id" = v_tenant
       AND ((r."clave" = 'ASESOR' AND 'cobro.corregir' = ANY (r."permisos"))
            OR (r."clave" = 'OPERACIONES'
                AND r."permisos" && ARRAY['cobro.registrar', 'cobro.corregir']));
    IF faltan > 0 THEN
      RAISE EXCEPTION 'La agencia % quedó con ASESOR u OPERACIONES con permisos de cobro que no les tocan.', v_tenant;
    END IF;
  END LOOP;
  PERFORM set_config('app.current_tenant', '', true);

  IF current_setting('app.current_tenant', true) IS DISTINCT FROM ''
     AND current_setting('app.current_tenant', true) IS NOT NULL THEN
    RAISE EXCEPTION 'La migración deja app.current_tenant fijado.';
  END IF;
END;
$$;
