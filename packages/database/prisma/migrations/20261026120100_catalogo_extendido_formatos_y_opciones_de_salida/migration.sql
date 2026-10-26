-- =============================================================================
-- ADR-0017, M2 — catálogo extendido, formatos de viaje, opciones de salida y `promo_vencida`
--
-- Exactamente la fila M2 de ADR-0017 §12, con la corrección de `experto-turismo` (§3.1): las
-- horas de salida y regreso NO son columnas de `paquetes`, son filas de `opciones_de_salida`,
-- porque un producto tiene varias (turno de mañana y de tarde; lancha o terrestre con su punto de
-- recogida) y una tarifa puede atarse a una de ellas.
--
-- Qué hace, en orden:
--   1. Tipo `promo_vencida` y su columna en `politicas_de_precio` (D3: OCULTAR por defecto).
--   2. `PAQUETE` en `entidad_personalizable` (no se usa en esta migración: ADD VALUE no puede
--      usarse en la misma transacción que lo añade).
--   3. `formatos_de_viaje`: tabla por agencia, con RLS, sembrada con los cuatro formatos de
--      sistema en cada agencia existente.
--   4. `paquetes`: plan de alimentación nulable, `codigo`, cargos en destino, campos propios y
--      `formato_id` con foránea COMPUESTA.
--   5. `opciones_de_salida`: tabla por agencia, con RLS y foránea COMPUESTA al paquete.
--   6. `tarifas`: precio de lista, `promo_hasta` y `opcion_de_salida_id` con foránea COMPUESTA.
--   7. RLS por el único mecanismo que la gobierna, y el cinturón que falla el despliegue.
--
-- **Segura en caliente y sin reescribir filas.** Toda columna nueva es nulable o lleva un DEFAULT
-- constante, que en PostgreSQL 11+ es un cambio de catálogo, no una reescritura. `DROP NOT NULL`
-- no toca filas. Los CHECK nuevos sobre `paquetes` y `tarifas` validan la tabla una vez, y son
-- tablas de catálogo (cientos de filas por agencia), no de volumen.
--
-- **REVERSIBLE con una migración posterior**, sin pérdida de lo que existía antes de esta:
--   · `DROP TABLE opciones_de_salida, formatos_de_viaje` (antes, las foráneas que las apuntan);
--   · `DROP COLUMN` de las columnas NUEVAS (`codigo`, `cargos_en_destino`, `campos_personalizados`,
--     `formato_id`, `lista_unidades`, `promo_hasta`, `opcion_de_salida_id`, `promo_vencida`) —
--     solo pierde lo que las agencias hayan escrito en ellas después de esta migración;
--   · `plan_alimentacion SET NOT NULL` exige antes rellenar los nulos (con `SIN_ALIMENTACION`,
--     que es lo que había antes de que existiera el nulo);
--   · el valor `PAQUETE` del enum no se puede quitar con ALTER TYPE: se deja (es inocuo sin filas
--     que lo usen) o se recrea el tipo. Es la única pieza que no se revierte limpia.
-- =============================================================================

-- uuid v7 en SQL, solo para la siembra de formatos de abajo (la aplicación los genera con Prisma).
-- OR REPLACE: `20261019230000` crea una del mismo nombre en `pg_temp`, y si las migraciones corren
-- en la misma sesión —la aserción 23 lo hace— un CREATE a secas fallaría.
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
-- 1. `promo_vencida` — política de PRESENTACIÓN por agencia (ADR-0017 §9, D3)
--
-- Vive en `politicas_de_precio` porque es la fila de política comercial del tenant y ya contiene
-- política de presentación (`modo_de_catalogo`). Nunca cambia la venta: la venta no cambia sola.
-- -----------------------------------------------------------------------------
CREATE TYPE "promo_vencida" AS ENUM ('OCULTAR', 'TACHAR');

ALTER TABLE "politicas_de_precio"
  ADD COLUMN "promo_vencida" "promo_vencida" NOT NULL DEFAULT 'OCULTAR';

COMMENT ON COLUMN "politicas_de_precio"."promo_vencida" IS
  'Qué se MUESTRA cuando venció promo_hasta: OCULTAR (por defecto, solo la venta) o TACHAR (lista tachada + «promo vencida»). Nunca cambia lo que se cobra. ADR-0017 §9.';

-- -----------------------------------------------------------------------------
-- 2. Campos personalizados del paquete
-- -----------------------------------------------------------------------------
ALTER TYPE "entidad_personalizable" ADD VALUE IF NOT EXISTS 'PAQUETE';

-- -----------------------------------------------------------------------------
-- 3. `formatos_de_viaje` — el `TripFormat` de ADR-0009 §4, con su plantilla de ENTRADA
--
-- Tabla por agencia, no enum (R12): la agencia los renombra, los ordena y crea otros. La
-- `plantilla` dice qué se pide al dar de alta un producto de ese formato; la valida Zod
-- (`PlantillaDeFormato`). **No hay ruta de cálculo que ramifique sobre el formato** (ADR-0009).
-- Sin tabla global: cada agencia recibe copias editables, como recibe sus roles sembrados.
-- -----------------------------------------------------------------------------
CREATE TABLE "formatos_de_viaje" (
    "id"             UUID         NOT NULL,
    "tenant_id"      UUID         NOT NULL,
    "nombre"         VARCHAR(80)  NOT NULL,
    "orden"          SMALLINT     NOT NULL DEFAULT 0,
    "activo"         BOOLEAN      NOT NULL DEFAULT true,
    "plantilla"      JSONB        NOT NULL DEFAULT '{}',
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "formatos_de_viaje_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "formatos_de_viaje_nombre_no_vacio" CHECK (length(btrim("nombre")) > 0),
    CONSTRAINT "formatos_de_viaje_plantilla_es_objeto" CHECK (jsonb_typeof("plantilla") = 'object')
);
-- El destino de la foránea compuesta de `paquetes`.
CREATE UNIQUE INDEX "formatos_de_viaje_id_tenant_id_key" ON "formatos_de_viaje" ("id", "tenant_id");
-- El tenant va primero: sirve también al listado por agencia.
CREATE UNIQUE INDEX "formatos_de_viaje_tenant_id_nombre_key" ON "formatos_de_viaje" ("tenant_id", "nombre");

ALTER TABLE "formatos_de_viaje" ADD CONSTRAINT "formatos_de_viaje_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 4. `paquetes`
-- -----------------------------------------------------------------------------

-- Un pasadía no tiene régimen alimenticio. Obligarlo hacía mentir a la semilla
-- (`SIN_ALIMENTACION` puesto a mano). Nulo = no aplica o no se declaró.
ALTER TABLE "paquetes" ALTER COLUMN "plan_alimentacion" DROP NOT NULL;

-- Clave natural preferente entre dos cargas (ADR-0017 §3). El nombre no es clave.
ALTER TABLE "paquetes" ADD COLUMN "codigo" VARCHAR(64);
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_codigo_no_vacio"
  CHECK ("codigo" IS NULL OR length(btrim("codigo")) > 0);
-- Único PARCIAL: un paquete borrado no retiene su código, y los que no lo tienen no chocan.
-- Prisma no modela índices parciales; vive aquí y lo documenta `schema.prisma`.
CREATE UNIQUE INDEX "paquetes_tenant_id_codigo_key"
  ON "paquetes" ("tenant_id", "codigo")
  WHERE "codigo" IS NOT NULL AND "eliminado_en" IS NULL;

-- Lo que se paga en destino y NO entra en el total (tasa portuaria, impuesto de muelle). La forma
-- la protege Zod; la base solo garantiza que sea una lista.
ALTER TABLE "paquetes" ADD COLUMN "cargos_en_destino" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_cargos_en_destino_es_lista"
  CHECK (jsonb_typeof("cargos_en_destino") = 'array');

-- Valores de los campos propios de la agencia (definiciones con entidad PAQUETE).
ALTER TABLE "paquetes" ADD COLUMN "campos_personalizados" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_campos_personalizados_es_objeto"
  CHECK (jsonb_typeof("campos_personalizados") = 'object');
CREATE INDEX "paquetes_campos_personalizados_idx"
  ON "paquetes" USING GIN ("campos_personalizados" jsonb_path_ops);

ALTER TABLE "paquetes" ADD COLUMN "formato_id" UUID;
CREATE INDEX "paquetes_tenant_id_formato_id_idx" ON "paquetes" ("tenant_id", "formato_id");
-- COMPUESTA: la integridad referencial se evalúa por encima de RLS, así que una foránea simple
-- dejaría a un paquete llevar el formato de otra agencia.
-- NO ACTION y no RESTRICT: al borrar un tenant, la cascada se lleva formatos y paquetes en la
-- misma sentencia, y RESTRICT se comprobaría a mitad de ella. Tampoco SET NULL: en una foránea
-- compuesta pondría a NULL también `tenant_id`. Un formato en uso no se borra: se desactiva.
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_formato_id_tenant_id_fkey"
  FOREIGN KEY ("formato_id", "tenant_id") REFERENCES "formatos_de_viaje" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 5. `opciones_de_salida` — ADR-0017 §3.1
--
-- La variante de operación que el viajero elige dentro del mismo producto: un turno, una
-- modalidad con su punto de recogida, o el hotel. Tabla y no JSON porque una tarifa la
-- referencia, y una referencia dentro de un jsonb no tiene integridad.
--
-- `time` SIN zona: hora local del punto de encuentro, igual que la fecha de viaje es `date`
-- (R9). Pasarla a UTC la rompería con el cambio de huso.
-- -----------------------------------------------------------------------------
CREATE TABLE "opciones_de_salida" (
    "id"                 UUID          NOT NULL,
    "tenant_id"          UUID          NOT NULL,
    "paquete_id"         UUID          NOT NULL,
    "etiqueta"           VARCHAR(120)  NOT NULL,
    "hora_salida"        TIME(0),
    "hora_regreso"       TIME(0),
    "punto_de_encuentro" VARCHAR(300),
    "orden"              SMALLINT      NOT NULL DEFAULT 0,
    "activa"             BOOLEAN       NOT NULL DEFAULT true,
    "creado_en"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"     TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "opciones_de_salida_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opciones_de_salida_etiqueta_no_vacia" CHECK (length(btrim("etiqueta")) > 0)
);
-- El destino de la foránea compuesta de `tarifas`.
CREATE UNIQUE INDEX "opciones_de_salida_id_tenant_id_key" ON "opciones_de_salida" ("id", "tenant_id");
CREATE UNIQUE INDEX "opciones_de_salida_paquete_id_etiqueta_key" ON "opciones_de_salida" ("paquete_id", "etiqueta");
-- La lectura caliente: las opciones de un paquete, con el tenant primero.
CREATE INDEX "opciones_de_salida_tenant_id_paquete_id_idx" ON "opciones_de_salida" ("tenant_id", "paquete_id");

ALTER TABLE "opciones_de_salida" ADD CONSTRAINT "opciones_de_salida_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- COMPUESTA: una agencia no cuelga una opción del paquete de otra. CASCADE como `vigencias`:
-- los paquetes no se borran (se desactivan), y si el propietario borra uno, sus opciones no
-- tienen sentido sin él.
ALTER TABLE "opciones_de_salida" ADD CONSTRAINT "opciones_de_salida_paquete_id_tenant_id_fkey"
  FOREIGN KEY ("paquete_id", "tenant_id") REFERENCES "paquetes" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 6. `tarifas` — precio de lista, fin de la promo y opción de salida
-- -----------------------------------------------------------------------------

-- Lo que se muestra tachado. NUNCA entra en el cálculo ni en la cotización congelada: lo que se
-- cobra es siempre `venta_unidades`. Misma unidad mínima y moneda que la venta (R8).
ALTER TABLE "tarifas" ADD COLUMN "lista_unidades" BIGINT;
-- Fin de la promo, fecha de calendario (fin del día en la zona del tenant, R9). Nulo = sin fin.
ALTER TABLE "tarifas" ADD COLUMN "promo_hasta" DATE;
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_lista_mayor_que_venta"
  CHECK ("lista_unidades" IS NULL OR "lista_unidades" > "venta_unidades");

-- Nula = la tarifa vale para todas las opciones del producto. Que la opción sea DEL MISMO
-- paquete que la vigencia no lo expresa una foránea: lo valida el núcleo, y es coherencia de
-- dominio, no aislamiento (la compuesta ya impide la opción de otra agencia).
ALTER TABLE "tarifas" ADD COLUMN "opcion_de_salida_id" UUID;
CREATE INDEX "tarifas_tenant_id_opcion_de_salida_id_idx" ON "tarifas" ("tenant_id", "opcion_de_salida_id");
-- NO ACTION, por la misma razón que el formato: una opción referenciada por tarifas no se
-- borra (se desactiva), pero la cascada de un tenant o de un paquete se lleva opciones y
-- tarifas en la misma sentencia y no debe abortar a mitad.
ALTER TABLE "tarifas" ADD CONSTRAINT "tarifas_opcion_de_salida_id_tenant_id_fkey"
  FOREIGN KEY ("opcion_de_salida_id", "tenant_id") REFERENCES "opciones_de_salida" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 7. RLS y privilegios, por el único mecanismo que los gobierna
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('formatos_de_viaje');
SELECT aplicar_aislamiento_tenant('opciones_de_salida');
-- Las tres que cambiaron de forma se reaplican: idempotente.
SELECT aplicar_aislamiento_tenant('paquetes');
SELECT aplicar_aislamiento_tenant('tarifas');
SELECT aplicar_aislamiento_tenant('politicas_de_precio');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 8. Los cuatro formatos de sistema para cada agencia existente
--
-- Después de la RLS a propósito, y agencia por agencia con su contexto: la fila entra por el
-- WITH CHECK de su propia agencia, igual que entraría desde la API, y el resultado no depende
-- de que el rol de migraciones tenga BYPASSRLS. Los descriptores completos (`PLANTILLAS_DE_SISTEMA`
-- de `packages/contracts`, T-033) los escribe el núcleo; aquí va la clave estable del formato,
-- su versión y los valores por defecto que no admiten discusión.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    INSERT INTO "formatos_de_viaje" ("id", "tenant_id", "nombre", "orden", "plantilla", "actualizado_en")
    SELECT pg_temp.uuid_v7(), t.id, s.nombre, s.orden, s.plantilla, now()
      FROM (VALUES
        ('Excursión de un día', 1, '{"clave":"excursion-de-un-dia","version":1,"valoresPorDefecto":{"dias":1,"noches":0}}'::jsonb),
        ('Pasadía',             2, '{"clave":"pasadia","version":1,"valoresPorDefecto":{"dias":1,"noches":0}}'::jsonb),
        ('Pasanoche',           3, '{"clave":"pasanoche","version":1,"valoresPorDefecto":{"dias":2,"noches":1}}'::jsonb),
        ('Paquete con hotel',   4, '{"clave":"paquete-con-hotel","version":1,"valoresPorDefecto":{}}'::jsonb)
      ) AS s(nombre, orden, plantilla)
    ON CONFLICT ("tenant_id", "nombre") DO NOTHING;
  END LOOP;

  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  simples text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- Toda foránea de las tablas tocadas lleva el tenant dentro, salvo la de `tenants` misma.
  SELECT string_agg(c.conname, ', ')
    INTO simples
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE c.contype = 'f'
     AND t.relname IN ('formatos_de_viaje', 'opciones_de_salida', 'paquetes', 'tarifas')
     AND c.confrelid <> 'public.tenants'::regclass
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(c.conkey) AS k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'tenant_id'
     );
  IF simples IS NOT NULL THEN
    RAISE EXCEPTION 'Quedan foraneas sin tenant_id en el catalogo -> %', simples;
  END IF;

  -- Las tres compuestas que esta migración crea, por nombre: si una faltara, el barrido de arriba
  -- no lo vería (no hay foránea que juzgar).
  IF (SELECT count(*) FROM pg_constraint
       WHERE contype = 'f'
         AND conname IN ('paquetes_formato_id_tenant_id_fkey',
                         'opciones_de_salida_paquete_id_tenant_id_fkey',
                         'tarifas_opcion_de_salida_id_tenant_id_fkey')) <> 3 THEN
    RAISE EXCEPTION 'Falta alguna de las foraneas compuestas de M2.';
  END IF;
END;
$$;
