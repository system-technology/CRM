-- =============================================================================
-- ADR-0009 — El precio se ata a una ventana de vigencia, no al paquete
--
-- `salidas` se RENOMBRA, no se borra. Una salida programada no desaparece: pasa a ser lo que
-- siempre fue, la vigencia de un solo día publicada. Renombrar conserva las filas, la política
-- RLS y la clave foránea; recrear la tabla habría tirado la semilla y, lo que importa más, habría
-- dejado la tabla nueva sin la política hasta la línea que la vuelve a aplicar.
--
-- Las dos invariantes del contrato se repiten aquí como CHECK a propósito. Zod protege lo que
-- entra por la API; un `psql` o una semilla con un error de dedo no pasan por Zod.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos nuevos
-- -----------------------------------------------------------------------------
CREATE TYPE "unidad_de_cobro" AS ENUM ('POR_PERSONA', 'POR_GRUPO');
CREATE TYPE "base_del_margen" AS ENUM ('SOBRE_EL_NETO', 'SOBRE_LA_VENTA');
CREATE TYPE "origen_de_la_venta" AS ENUM ('DERIVADA_DEL_NETO', 'FIJADA_EN_EL_TARIFARIO');
CREATE TYPE "modo_de_catalogo" AS ENUM ('SALIDAS_PUBLICADAS', 'VIGENCIA_ABIERTA', 'AMBOS');

-- -----------------------------------------------------------------------------
-- 2. `salidas` -> `vigencias`
--
-- Las filas que existían son fechas concretas: nacen con `hasta = desde` y publicadas, que es
-- exactamente lo que eran. `cupo_vendido` se va porque el inventario de sillas es del mayorista:
-- un revendedor pregunta la disponibilidad, no la lleva.
-- -----------------------------------------------------------------------------
ALTER TABLE "salidas" RENAME TO "vigencias";
ALTER TABLE "vigencias" RENAME COLUMN "fecha" TO "desde";

DROP INDEX IF EXISTS "salidas_tenant_id_paquete_id_fecha_key";
DROP INDEX IF EXISTS "salidas_tenant_id_fecha_activa_idx";

ALTER TABLE "vigencias" ADD COLUMN "hasta" DATE;
UPDATE "vigencias" SET "hasta" = "desde" WHERE "hasta" IS NULL;
ALTER TABLE "vigencias" ALTER COLUMN "hasta" SET NOT NULL;

ALTER TABLE "vigencias" ADD COLUMN "publicada" BOOLEAN NOT NULL DEFAULT false;
UPDATE "vigencias" SET "publicada" = true;

ALTER TABLE "vigencias" DROP COLUMN IF EXISTS "cupo_vendido";

-- El orden de los extremos no es cosa de la capa de aplicación: una ventana invertida no
-- resuelve ninguna fecha y rompería el cálculo de longitud del desempate.
ALTER TABLE "vigencias"
  ADD CONSTRAINT "vigencias_rango_coherente" CHECK ("desde" <= "hasta");

-- Solo se publica una fecha concreta. Una vigencia abierta publicada sería una salida sin día,
-- que es justo lo que ADR-0009 dice que no existe.
ALTER TABLE "vigencias"
  ADD CONSTRAINT "vigencias_publicada_es_un_dia"
  CHECK (NOT "publicada" OR "desde" = "hasta");

ALTER TABLE "vigencias" RENAME CONSTRAINT "salidas_pkey" TO "vigencias_pkey";
ALTER TABLE "vigencias" RENAME CONSTRAINT "salidas_paquete_id_fkey" TO "vigencias_paquete_id_fkey";

CREATE UNIQUE INDEX "vigencias_tenant_id_paquete_id_desde_hasta_key"
  ON "vigencias" ("tenant_id", "paquete_id", "desde", "hasta");

-- La consulta del cotizador: dado un paquete y una fecha, qué ventanas la cubren.
CREATE INDEX "vigencias_tenant_id_paquete_id_desde_hasta_idx"
  ON "vigencias" ("tenant_id", "paquete_id", "desde", "hasta");

-- -----------------------------------------------------------------------------
-- 3. `tarifas` — el precio, colgando de la ventana
-- -----------------------------------------------------------------------------
CREATE TABLE "tarifas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "vigencia_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "unidad" "unidad_de_cobro" NOT NULL DEFAULT 'POR_PERSONA',
    "cubre_pasajeros" SMALLINT NOT NULL DEFAULT 1,
    -- Nulo es legítimo: la tarifa cotiza igual y el margen sale DESCONOCIDO, que es la verdad
    -- mientras no llegue la hoja de netos del mayorista. Decir «margen 0» afirmaría que vendemos
    -- a precio de costo, y eso es otra cosa.
    "neto_unidades" BIGINT,
    "venta_unidades" BIGINT NOT NULL,
    "moneda_iso" CHAR(3) NOT NULL,
    "mayorista_id" UUID,
    "aditiva" BOOLEAN NOT NULL DEFAULT false,
    "acomodacion" "acomodacion",
    "tipo_pasajero" "tipo_pasajero",
    "edad_minima" SMALLINT,
    "edad_maxima" SMALLINT,
    "pasajeros_minimo" SMALLINT,
    "pasajeros_maximo" SMALLINT,
    "ocupa_silla" BOOLEAN,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tarifas_pkey" PRIMARY KEY ("id")
);

-- La unidad de cobro es el DENOMINADOR: si dice «por persona», cubre a una. Esto es aritmética,
-- no política comercial, así que se defiende en la base y no solo en el contrato.
ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_por_persona_cubre_uno"
  CHECK ("unidad" <> 'POR_PERSONA' OR "cubre_pasajeros" = 1);

ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_cubre_pasajeros_positivo" CHECK ("cubre_pasajeros" >= 1);

ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_edades_coherentes"
  CHECK ("edad_minima" IS NULL OR "edad_maxima" IS NULL OR "edad_minima" <= "edad_maxima");

ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_pasajeros_coherentes"
  CHECK ("pasajeros_minimo" IS NULL OR "pasajeros_maximo" IS NULL
         OR "pasajeros_minimo" <= "pasajeros_maximo");

-- Vender en negativo no es una política: es un error de captura.
ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_venta_no_negativa" CHECK ("venta_unidades" >= 0);
ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_neto_no_negativo"
  CHECK ("neto_unidades" IS NULL OR "neto_unidades" >= 0);

CREATE INDEX "tarifas_tenant_id_vigencia_id_idx" ON "tarifas" ("tenant_id", "vigencia_id");

-- Foránea simple, igual que el resto del esquema (`precios`, `temporadas`, `paquetes`).
--
-- Conviene saber lo que esto NO cubre: la integridad referencial se evalúa POR ENCIMA de las
-- políticas RLS, así que una foránea simple deja que una fila cuelgue de la de otra agencia si
-- alguien escribe el id cruzado. La defensa real es que `tenant_id` lo pone el servidor y nunca
-- el cliente. Meterle el tenant dentro a la foránea es una mejora que vale para TODO el esquema,
-- no para una tabla suelta: queda en la cola de `ESTADO.md` como barrido, con dueño `datos`.
ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_vigencia_id_fkey"
  FOREIGN KEY ("vigencia_id") REFERENCES "vigencias" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tarifas"
  ADD CONSTRAINT "tarifas_mayorista_id_fkey"
  FOREIGN KEY ("mayorista_id") REFERENCES "mayoristas" ("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 4. `politicas_de_precio` — una fila por agencia
-- -----------------------------------------------------------------------------
CREATE TABLE "politicas_de_precio" (
    "tenant_id" UUID NOT NULL,
    "modo_de_catalogo" "modo_de_catalogo" NOT NULL DEFAULT 'AMBOS',
    "porcentaje" DECIMAL(6,3) NOT NULL DEFAULT 20,
    "base" "base_del_margen" NOT NULL DEFAULT 'SOBRE_EL_NETO',
    "origen_de_la_venta" "origen_de_la_venta" NOT NULL DEFAULT 'DERIVADA_DEL_NETO',
    "redondeo_venta" INTEGER NOT NULL DEFAULT 1000,
    "admite_margen_por_tarifa" BOOLEAN NOT NULL DEFAULT true,
    "actualizada_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "politicas_de_precio_pkey" PRIMARY KEY ("tenant_id")
);

ALTER TABLE "politicas_de_precio"
  ADD CONSTRAINT "politicas_de_precio_porcentaje_valido"
  CHECK ("porcentaje" >= 0 AND "porcentaje" <= 500);

-- Una comisión del 100 % sobre la venta no tiene precio de venta finito: venta = neto / (1 - p).
-- Se corta aquí y no en una división por cero tres capas más abajo.
ALTER TABLE "politicas_de_precio"
  ADD CONSTRAINT "politicas_de_precio_comision_finita"
  CHECK ("base" <> 'SOBRE_LA_VENTA' OR "porcentaje" < 100);

ALTER TABLE "politicas_de_precio"
  ADD CONSTRAINT "politicas_de_precio_redondeo_valido"
  CHECK ("redondeo_venta" >= 0 AND "redondeo_venta" <= 1000000);

ALTER TABLE "politicas_de_precio"
  ADD CONSTRAINT "politicas_de_precio_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON COLUMN "politicas_de_precio"."base" IS
  '«Margen del 20 %» tiene dos lecturas: sobre un neto de 1.000.000, SOBRE_EL_NETO da 1.200.000 y SOBRE_LA_VENTA da 1.250.000. El propietario fijo SOBRE_EL_NETO el 2026-10-13 (ADR-0009 §2).';

COMMENT ON COLUMN "tarifas"."neto_unidades" IS
  'Lo que cobra el mayorista. NUNCA sale del tenant. Nulo = margen desconocido, no margen cero.';

-- -----------------------------------------------------------------------------
-- 5. RLS. Dirigida por datos, igual que el resto del esquema.
--
-- `vigencias` ya tenía política —se renombró con la tabla—, pero se reaplica igual: es
-- idempotente y deja las tres tablas gobernadas por el mismo mecanismo en vez de por su historia.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('vigencias');
SELECT aplicar_aislamiento_tenant('tarifas');
SELECT aplicar_aislamiento_tenant('politicas_de_precio');
SELECT aplicar_privilegios_declarados();

-- Cinturón: si algo de lo anterior hubiera dejado una tabla de negocio sin aislamiento, esta
-- migración no termina. Convierte el defecto en un fallo de despliegue en vez de en un hallazgo
-- de auditoría seis meses después.
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
