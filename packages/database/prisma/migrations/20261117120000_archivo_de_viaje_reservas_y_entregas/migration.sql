-- =============================================================================
-- T-240, ADR-0024 F1 — archivo de viaje, reservas, pasajeros y entregas de eventos (sin código)
--
-- Solo el esquema y el aislamiento de la Fase 1 de ADR-0024 (§3.2–§3.5, §1 «entregas» y §5.2).
-- Nada lo escribe todavía: el despachador, el consumidor `booking.abrir_archivo` y el rol
-- `viajapro_planificador` con sus funciones son F2 y F5; las rutas, F3.
--
-- Qué hace, en orden:
--   1. Cuatro enums nuevos (`estado_archivo_de_viaje`, `motivo_cancelacion_archivo`,
--      `estado_reserva`, `motivo_caida_reserva`) y `fuente_trm` (OFICIAL · AGENCIA), que F2
--      reutiliza en `versiones_cotizacion`. Los pasajeros usan el `tipo_pasajero` que ya existe.
--   2. `outbox` gana `UNIQUE (id, tenant_id)` (destino de la foránea compuesta de las entregas) y
--      el índice `(tenant_id, tipo_evento, id)` con el que cada consumidor encuentra lo suyo.
--   3. `travel_files`, `bookings`, `pasajeros` y `entregas_de_eventos`: `tenant_id NOT NULL` con
--      foránea a `tenants ON DELETE CASCADE`, `UNIQUE (id, tenant_id)` en las tres primeras, toda
--      foránea entre tablas de agencia COMPUESTA con el tenant (tabla de §3.2), los CHECK de estado
--      de §3.3/§3.4/§3.5 y los índices de las rutas calientes.
--   4. RLS habilitada y FORZADA con la política canónica (`aplicar_aislamiento_tenant`). Ninguna es
--      excepción global.
--   5. `privilegios_declarados` (ADR-0024 §5.2) y el tercer paso de
--      `aplicar_privilegios_declarados()`, copiado de `policies/001-aislamiento-tenant.sql`, que es
--      su fuente. Las cuatro tablas, SOLO para `viajapro_app`.
--   6. Cinturón.
--
-- **Amplía ADR-0008 §1.3** (lo dice ADR-0024 §5.2): hasta aquí los tres roles de login de
-- aplicación tenían privilegios IDÉNTICOS sobre toda tabla de negocio y se distinguían solo en qué
-- funciones ejecutan. Desde esta migración, además, en las tablas declaradas como dato en
-- `privilegios_declarados`: `viajapro_webhook` (trabajador y relay), `viajapro_altas` y
-- `viajapro_identidad` no tienen NINGÚN privilegio sobre las cuatro tablas de este archivo. Por
-- declaración, no por un `REVOKE` suelto que la siguiente llamada a la función desharía.
--
-- **Sin DELETE en `travel_files`, `bookings` ni `entregas_de_eventos`**: un archivo o una reserva
-- no se borran, se cancelan (por eso tampoco llevan `eliminado_en`); una entrega se marca. La
-- cascada del tenant y la del outbox corren como dueño de la tabla. `pasajeros` sí lo lleva: la
-- lista se reemplaza entera (`PUT /archivos/:id/pasajeros`).
--
-- **Sin PII sensible (R10).** Del pasajero solo nombre, tipo, edad al viaje y titular; documento y
-- fecha de nacimiento quedan para el ADR de PII del pasajero (ADR-0024 §3.5). Nombre y edad son
-- datos personales (Ley 1581): no van al outbox, ni a la auditoría, ni a los logs.
-- `entregas_de_eventos.ultimo_error` admite solo un código o una clase de error (CHECK), nunca
-- texto libre.
--
-- **Dinero (R8)** en `bigint` en la unidad mínima de la moneda + `char(3)`; la TRM en
-- `numeric(18,6)` con su fecha y su fuente, las cinco o ninguna. **Instantes (R9)** en
-- `timestamptz(3)` UTC; `fecha_salida` es `date`.
--
-- **Segura en caliente.** Tablas y tipos nuevos. Sobre `outbox`, dos índices sin CONCURRENTLY
-- (Prisma corre la migración en una transacción, mismo criterio que 20261104140000): bloquean las
-- escrituras del outbox mientras se construyen, y hoy la tabla tiene pocas filas (no hay agencia
-- real, CLAUDE.md §1). Con volumen irían en una migración aparte con CONCURRENTLY.
--
-- **REVERSIBLE** con una migración posterior, mientras no haya archivos reales (ADR-0024,
-- «Qué habría que cambiar para revertir esto»):
--   DELETE FROM privilegios_declarados WHERE tabla IN ('travel_files','bookings','pasajeros','entregas_de_eventos');
--   DROP TABLE entregas_de_eventos, pasajeros, bookings, travel_files;
--   DROP TYPE estado_reserva, motivo_caida_reserva, estado_archivo_de_viaje,
--             motivo_cancelacion_archivo, fuente_trm;
--   DROP INDEX outbox_tenant_id_tipo_evento_id_idx, outbox_id_tenant_id_key;
-- `privilegios_declarados` y el tercer paso de la función pueden quedarse: vacíos no hacen nada.
-- Con archivos reales no se revierte: se supersede ADR-0024.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos
-- -----------------------------------------------------------------------------
CREATE TYPE "fuente_trm" AS ENUM ('OFICIAL', 'AGENCIA');
CREATE TYPE "estado_archivo_de_viaje" AS ENUM ('ABIERTO', 'CANCELADO');
CREATE TYPE "motivo_cancelacion_archivo" AS ENUM (
  'CLIENTE_DESISTIO', 'SIN_DISPONIBILIDAD', 'CAMBIO_DE_FECHA', 'OTRO'
);
CREATE TYPE "estado_reserva" AS ENUM (
  'PENDIENTE', 'SOLICITADA', 'EN_ESPERA', 'CONFIRMADA',
  'ABONADA_AL_PROVEEDOR', 'PAGADA_AL_PROVEEDOR', 'CAIDA', 'CANCELADA'
);
CREATE TYPE "motivo_caida_reserva" AS ENUM (
  'TIME_LIMIT_VENCIDO', 'PAGO_TOTAL_VENCIDO', 'SIN_CUPO', 'NEGADA_EN_ESPERA', 'OTRO'
);

-- -----------------------------------------------------------------------------
-- 2. `outbox`: la clave compuesta y el índice por consumidor (ADR-0024 §1)
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "outbox_id_tenant_id_key" ON "outbox" ("id", "tenant_id");
CREATE INDEX "outbox_tenant_id_tipo_evento_id_idx" ON "outbox" ("tenant_id", "tipo_evento", "id");

-- -----------------------------------------------------------------------------
-- 3a. `travel_files` — el archivo de viaje (ADR-0024 §3.3)
-- -----------------------------------------------------------------------------
CREATE TABLE "travel_files" (
    "id"                 UUID           NOT NULL,
    "tenant_id"          UUID           NOT NULL,
    -- El número de file legible, consecutivo por agencia. Lo asigna la apertura (max + 1).
    "numero"             INTEGER        NOT NULL,
    "contacto_id"        UUID           NOT NULL,
    "oportunidad_id"     UUID,
    "cotizacion_id"      UUID           NOT NULL,
    "version_cotizacion" SMALLINT       NOT NULL,
    -- Copia de lo vendido: la versión es inmutable, así que no diverge.
    "paquete_nombre"     VARCHAR(200)   NOT NULL,
    "destino"            VARCHAR(120)   NOT NULL,
    "fecha_salida"       DATE           NOT NULL,
    "noches"             SMALLINT       NOT NULL,
    "adultos"            SMALLINT       NOT NULL,
    "ninos"              SMALLINT       NOT NULL,
    "infantes"           SMALLINT       NOT NULL,
    "venta_unidades"     BIGINT         NOT NULL,
    "moneda_iso"         CHAR(3)        NOT NULL,
    "trm_moneda_origen"  CHAR(3),
    "trm_moneda_destino" CHAR(3),
    "trm_valor"          DECIMAL(18,6),
    "trm_fecha"          DATE,
    "trm_fuente"         "fuente_trm",
    -- El único eje que alguien fija con un botón. El avance lo deriva el dominio.
    "estado"             "estado_archivo_de_viaje" NOT NULL DEFAULT 'ABIERTO',
    "motivo_cancelacion" "motivo_cancelacion_archivo",
    "nota_cancelacion"   VARCHAR(500),
    "cancelado_en"       TIMESTAMPTZ(3),
    "cancelado_por"      UUID,
    "creado_en"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"     TIMESTAMPTZ(3) NOT NULL,
    -- Nulos: el archivo lo abre el consumidor del evento, no un usuario.
    "creado_por"         UUID,
    "actualizado_por"    UUID,

    CONSTRAINT "travel_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "travel_files_numero_positivo" CHECK ("numero" > 0),
    CONSTRAINT "travel_files_version_positiva" CHECK ("version_cotizacion" > 0),
    CONSTRAINT "travel_files_conteos_no_negativos"
      CHECK ("noches" >= 0 AND "adultos" >= 0 AND "ninos" >= 0 AND "infantes" >= 0),
    CONSTRAINT "travel_files_venta_no_negativa" CHECK ("venta_unidades" >= 0),
    CONSTRAINT "travel_files_moneda_iso" CHECK ("moneda_iso" ~ '^[A-Z]{3}$'),
    CONSTRAINT "travel_files_textos_no_vacios"
      CHECK (length(btrim("paquete_nombre")) > 0 AND length(btrim("destino")) > 0),
    -- La TRM: las cinco o ninguna, como en la versión (ADR-0024 §2).
    CONSTRAINT "travel_files_trm_completa" CHECK (
      ("trm_moneda_origen" IS NULL AND "trm_moneda_destino" IS NULL AND "trm_valor" IS NULL
        AND "trm_fecha" IS NULL AND "trm_fuente" IS NULL)
      OR ("trm_moneda_origen" ~ '^[A-Z]{3}$' AND "trm_moneda_destino" ~ '^[A-Z]{3}$'
        AND "trm_valor" IS NOT NULL AND "trm_fecha" IS NOT NULL AND "trm_fuente" IS NOT NULL)
    ),
    -- CANCELADO exige motivo, instante y autor; ABIERTO no lleva ninguno.
    CONSTRAINT "travel_files_cancelado_exige_motivo" CHECK (
      ("estado" = 'ABIERTO' AND "motivo_cancelacion" IS NULL AND "nota_cancelacion" IS NULL
        AND "cancelado_en" IS NULL AND "cancelado_por" IS NULL)
      OR ("estado" = 'CANCELADO' AND "motivo_cancelacion" IS NOT NULL
        AND "cancelado_en" IS NOT NULL AND "cancelado_por" IS NOT NULL)
    ),
    -- `OTRO` sin explicación no es un motivo.
    CONSTRAINT "travel_files_otro_exige_nota" CHECK (
      "motivo_cancelacion" IS DISTINCT FROM 'OTRO'
      OR length(btrim(COALESCE("nota_cancelacion", ''))) > 0
    )
);

COMMENT ON TABLE "travel_files" IS
  'Archivo de viaje (TravelFile, «Reservas» en la interfaz). ADR-0024 §3.3. Se cancela, no se borra. Sin PII sensible.';

CREATE UNIQUE INDEX "travel_files_id_tenant_id_key" ON "travel_files" ("id", "tenant_id");
CREATE UNIQUE INDEX "travel_files_tenant_id_numero_key" ON "travel_files" ("tenant_id", "numero");
-- La idempotencia del consumidor: una cotización abre un solo archivo. Sirve también a la foránea
-- hacia la versión (prefijo tenant_id, cotizacion_id).
CREATE UNIQUE INDEX "travel_files_tenant_id_cotizacion_id_key" ON "travel_files" ("tenant_id", "cotizacion_id");
CREATE INDEX "travel_files_tenant_id_contacto_id_idx" ON "travel_files" ("tenant_id", "contacto_id");
CREATE INDEX "travel_files_tenant_id_oportunidad_id_idx" ON "travel_files" ("tenant_id", "oportunidad_id");
-- La pantalla «Reservas»: los abiertos de la agencia por fecha de salida.
CREATE INDEX "travel_files_tenant_id_estado_fecha_salida_idx" ON "travel_files" ("tenant_id", "estado", "fecha_salida");

-- -----------------------------------------------------------------------------
-- 3b. `bookings` — la reserva con un mayorista (ADR-0024 §3.4)
-- -----------------------------------------------------------------------------
CREATE TABLE "bookings" (
    "id"                          UUID           NOT NULL,
    "tenant_id"                   UUID           NOT NULL,
    "travel_file_id"              UUID           NOT NULL,
    -- Nulo = «por definir» (una línea sin mayorista) o el mayorista se borró: el nombre queda.
    "mayorista_id"                UUID,
    "mayorista_nombre"            VARCHAR(200),
    "neto_unidades"               BIGINT,
    "moneda_iso"                  CHAR(3)        NOT NULL,
    "localizador"                 VARCHAR(64),
    "estado"                      "estado_reserva" NOT NULL DEFAULT 'PENDIENTE',
    "solicitada_en"               TIMESTAMPTZ(3),
    "confirmada_en"               TIMESTAMPTZ(3),
    "abonada_en"                  TIMESTAMPTZ(3),
    "pagada_en"                   TIMESTAMPTZ(3),
    -- Los dos plazos del mayorista, UTC.
    "time_limit"                  TIMESTAMPTZ(3),
    "pago_total_vence_en"         TIMESTAMPTZ(3),
    "motivo_caida"                "motivo_caida_reserva",
    "nota"                        VARCHAR(500),
    -- Marcas de aviso (§3.6): «una vez» = la marca, escrita con WHERE ... IS NULL.
    "aviso_time_limit_proximo_en" TIMESTAMPTZ(3),
    "aviso_time_limit_vencido_en" TIMESTAMPTZ(3),
    "aviso_pago_total_proximo_en" TIMESTAMPTZ(3),
    "aviso_pago_total_vencido_en" TIMESTAMPTZ(3),
    "creado_en"                   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"              TIMESTAMPTZ(3) NOT NULL,
    "creado_por"                  UUID,
    "actualizado_por"             UUID,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bookings_moneda_iso" CHECK ("moneda_iso" ~ '^[A-Z]{3}$'),
    CONSTRAINT "bookings_neto_no_negativo" CHECK ("neto_unidades" IS NULL OR "neto_unidades" >= 0),
    CONSTRAINT "bookings_localizador_no_vacio"
      CHECK ("localizador" IS NULL OR length(btrim("localizador")) > 0),
    -- Las exigencias por estado de §3.4. Son la red de la máquina del dominio: una reserva
    -- confirmada sin time limit, o abonada sin fecha de pago total, no puede existir.
    CONSTRAINT "bookings_solicitada_exige_fecha" CHECK (
      "estado" NOT IN ('SOLICITADA', 'EN_ESPERA', 'CONFIRMADA', 'ABONADA_AL_PROVEEDOR', 'PAGADA_AL_PROVEEDOR')
      OR "solicitada_en" IS NOT NULL
    ),
    CONSTRAINT "bookings_confirmada_exige_time_limit" CHECK (
      "estado" NOT IN ('CONFIRMADA', 'ABONADA_AL_PROVEEDOR', 'PAGADA_AL_PROVEEDOR')
      OR ("confirmada_en" IS NOT NULL AND "time_limit" IS NOT NULL)
    ),
    CONSTRAINT "bookings_abonada_exige_pago_total" CHECK (
      "estado" NOT IN ('ABONADA_AL_PROVEEDOR', 'PAGADA_AL_PROVEEDOR')
      OR ("abonada_en" IS NOT NULL AND "pago_total_vence_en" IS NOT NULL)
    ),
    CONSTRAINT "bookings_pagada_exige_fecha" CHECK (
      "estado" <> 'PAGADA_AL_PROVEEDOR' OR "pagada_en" IS NOT NULL
    ),
    -- CAIDA exige su motivo, y solo CAIDA lo lleva.
    CONSTRAINT "bookings_caida_exige_motivo" CHECK (("estado" = 'CAIDA') = ("motivo_caida" IS NOT NULL)),
    -- El time limit (abono) no puede vencer después del pago total.
    CONSTRAINT "bookings_time_limit_antes_del_pago_total" CHECK (
      "time_limit" IS NULL OR "pago_total_vence_en" IS NULL OR "time_limit" <= "pago_total_vence_en"
    )
);

COMMENT ON TABLE "bookings" IS
  'Reserva con un mayorista dentro de un archivo (Booking). ADR-0024 §3.4. Estados con CHECK por paso; se cancela o se cae, no se borra.';
COMMENT ON COLUMN "bookings"."time_limit" IS
  'timeLimit: hasta cuándo el mayorista sostiene la reserva sin abono (UTC). Obligatorio desde CONFIRMADA.';
COMMENT ON COLUMN "bookings"."pago_total_vence_en" IS
  'finalPaymentDue: hasta cuándo hay que pagarle el total al mayorista (UTC). Obligatorio desde ABONADA_AL_PROVEEDOR.';

CREATE UNIQUE INDEX "bookings_id_tenant_id_key" ON "bookings" ("id", "tenant_id");
CREATE INDEX "bookings_tenant_id_travel_file_id_idx" ON "bookings" ("tenant_id", "travel_file_id");
CREATE INDEX "bookings_tenant_id_mayorista_id_idx" ON "bookings" ("tenant_id", "mayorista_id");
-- La pantalla «Reservas» y la vigilancia: el plazo vigente de cada estado, el más próximo primero.
CREATE INDEX "bookings_time_limit_vigente_idx" ON "bookings" ("tenant_id", "time_limit")
  WHERE "estado" = 'CONFIRMADA';
CREATE INDEX "bookings_pago_total_vigente_idx" ON "bookings" ("tenant_id", "pago_total_vence_en")
  WHERE "estado" = 'ABONADA_AL_PROVEEDOR';

-- -----------------------------------------------------------------------------
-- 3c. `pasajeros` — mínimo, sin PII sensible (ADR-0024 §3.5)
-- -----------------------------------------------------------------------------
CREATE TABLE "pasajeros" (
    "id"              UUID           NOT NULL,
    "tenant_id"       UUID           NOT NULL,
    "travel_file_id"  UUID           NOT NULL,
    "nombre"          VARCHAR(200)   NOT NULL,
    "tipo"            "tipo_pasajero" NOT NULL,
    "edad_al_viaje"   SMALLINT,
    -- leadPassenger: a nombre de quien va la reserva ante el mayorista.
    "es_titular"      BOOLEAN        NOT NULL DEFAULT false,
    "orden"           SMALLINT       NOT NULL,
    "creado_en"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"  TIMESTAMPTZ(3) NOT NULL,
    "creado_por"      UUID,
    "actualizado_por" UUID,

    CONSTRAINT "pasajeros_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pasajeros_nombre_no_vacio" CHECK (length(btrim("nombre")) > 0),
    CONSTRAINT "pasajeros_edad_en_rango"
      CHECK ("edad_al_viaje" IS NULL OR "edad_al_viaje" BETWEEN 0 AND 120),
    -- Sin rangos por tipo (la edad de corte es política del mayorista, R12); solo que CHD e INF
    -- la lleven.
    CONSTRAINT "pasajeros_menor_exige_edad" CHECK ("tipo" = 'ADT' OR "edad_al_viaje" IS NOT NULL),
    CONSTRAINT "pasajeros_orden_no_negativo" CHECK ("orden" >= 0)
);

COMMENT ON TABLE "pasajeros" IS
  'Pasajero dentro de un archivo (Passenger). ADR-0024 §3.5: nombre, tipo, edad al viaje y titular. Sin documento ni fecha de nacimiento (ADR de PII del pasajero, ADR-0015). Datos personales: no van al outbox, a la auditoría ni a los logs.';

CREATE UNIQUE INDEX "pasajeros_id_tenant_id_key" ON "pasajeros" ("id", "tenant_id");
CREATE INDEX "pasajeros_tenant_id_travel_file_id_orden_idx" ON "pasajeros" ("tenant_id", "travel_file_id", "orden");
-- A lo sumo un titular por archivo. «Al menos uno cuando hay pasajeros» es del dominio.
CREATE UNIQUE INDEX "pasajeros_un_titular_por_archivo" ON "pasajeros" ("tenant_id", "travel_file_id")
  WHERE "es_titular";

-- -----------------------------------------------------------------------------
-- 3d. `entregas_de_eventos` — una fila por (evento, consumidor) (ADR-0024 §1)
-- -----------------------------------------------------------------------------
CREATE TABLE "entregas_de_eventos" (
    "tenant_id"      UUID           NOT NULL,
    "outbox_id"      BIGINT         NOT NULL,
    "consumidor"     VARCHAR(80)    NOT NULL,
    -- En la MISMA transacción que el efecto del consumidor.
    "entregado_en"   TIMESTAMPTZ(3),
    "intentos"       SMALLINT       NOT NULL DEFAULT 0,
    -- Solo la clase o el código del error: nunca payload, mensaje libre ni dato personal.
    "ultimo_error"   VARCHAR(200),
    "abandonado_en"  TIMESTAMPTZ(3),
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entregas_de_eventos_pkey" PRIMARY KEY ("tenant_id", "outbox_id", "consumidor"),
    CONSTRAINT "entregas_de_eventos_consumidor_formato" CHECK ("consumidor" ~ '^[a-z]+\.[a-z_]+$'),
    CONSTRAINT "entregas_de_eventos_intentos_no_negativos" CHECK ("intentos" >= 0),
    CONSTRAINT "entregas_de_eventos_ultimo_error_es_codigo"
      CHECK ("ultimo_error" IS NULL OR "ultimo_error" ~ '^[A-Za-z0-9_.:-]+$'),
    CONSTRAINT "entregas_de_eventos_entregada_o_abandonada"
      CHECK (NOT ("entregado_en" IS NOT NULL AND "abandonado_en" IS NOT NULL))
);

COMMENT ON TABLE "entregas_de_eventos" IS
  'Registro de entrega de un evento del outbox a un consumidor de dominio (ADR-0024 §1). outbox.publicado_en sigue significando solo «el relay de inbox lo publicó a tiempo real».';

-- -----------------------------------------------------------------------------
-- 3e. Foráneas: con `tenants` en cascada, y entre tablas de agencia SIEMPRE compuestas
--
-- NO ACTION y no RESTRICT donde la cascada del tenant se lleva las dos filas en la misma sentencia
-- (mismo motivo que 20261115150000). `SET NULL ("mayorista_id")` con la columna NOMBRADA: a secas,
-- sobre una clave compuesta, anularía también `tenant_id` (20261013230000 §4).
-- -----------------------------------------------------------------------------
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
-- La oportunidad es de esta agencia y del MISMO contacto (clave de tres columnas que ya existe).
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_oportunidad_id_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("oportunidad_id", "contacto_id", "tenant_id")
  REFERENCES "oportunidades" ("id", "contacto_id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_cotizacion_id_tenant_id_fkey"
  FOREIGN KEY ("cotizacion_id", "tenant_id") REFERENCES "cotizaciones" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
-- La versión, por la terna que ya existe (como `cotizaciones_version_enviada_fkey`): el tenant es
-- parte de la clave, así que no puede apuntar a la versión de otra agencia.
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_version_cotizacion_fkey"
  FOREIGN KEY ("tenant_id", "cotizacion_id", "version_cotizacion")
  REFERENCES "versiones_cotizacion" ("tenant_id", "cotizacion_id", "numero")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "travel_files" ADD CONSTRAINT "travel_files_cancelado_por_tenant_id_fkey"
  FOREIGN KEY ("cancelado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_travel_file_id_tenant_id_fkey"
  FOREIGN KEY ("travel_file_id", "tenant_id") REFERENCES "travel_files" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_mayorista_id_tenant_id_fkey"
  FOREIGN KEY ("mayorista_id", "tenant_id") REFERENCES "mayoristas" ("id", "tenant_id")
  ON DELETE SET NULL ("mayorista_id") ON UPDATE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

ALTER TABLE "pasajeros" ADD CONSTRAINT "pasajeros_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pasajeros" ADD CONSTRAINT "pasajeros_travel_file_id_tenant_id_fkey"
  FOREIGN KEY ("travel_file_id", "tenant_id") REFERENCES "travel_files" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "pasajeros" ADD CONSTRAINT "pasajeros_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;
ALTER TABLE "pasajeros" ADD CONSTRAINT "pasajeros_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE NO ACTION ON UPDATE RESTRICT;

ALTER TABLE "entregas_de_eventos" ADD CONSTRAINT "entregas_de_eventos_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- CASCADE: borrar una fila del outbox se lleva sus entregas. No hay SET NULL posible: todas las
-- columnas son NOT NULL.
ALTER TABLE "entregas_de_eventos" ADD CONSTRAINT "entregas_de_eventos_outbox_id_tenant_id_fkey"
  FOREIGN KEY ("outbox_id", "tenant_id") REFERENCES "outbox" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 4. RLS habilitada y forzada, política canónica con USING y WITH CHECK
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('travel_files');
SELECT aplicar_aislamiento_tenant('bookings');
SELECT aplicar_aislamiento_tenant('pasajeros');
SELECT aplicar_aislamiento_tenant('entregas_de_eventos');

-- -----------------------------------------------------------------------------
-- 5. `privilegios_declarados` y el tercer paso de `aplicar_privilegios_declarados()`
--
-- Tabla y función copiadas de `policies/001-aislamiento-tenant.sql` (§0 bis y §5), que es la fuente:
-- la aserción 22 reaplica ese archivo y tiene que dejar lo mismo que esta migración.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "privilegios_declarados" (
    "tabla" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "privilegios" TEXT[] NOT NULL,
    "motivo" TEXT NOT NULL,

    CONSTRAINT "privilegios_declarados_pkey" PRIMARY KEY ("tabla","rol"),
    CONSTRAINT "privilegios_declarados_sin_nulos" CHECK (array_position("privilegios", NULL) IS NULL),
    CONSTRAINT "privilegios_declarados_motivo_no_vacio" CHECK (length(btrim("motivo")) > 0)
);

COMMENT ON TABLE privilegios_declarados IS
  'Privilegios exactos por (tabla, rol) sobre tablas CON RLS forzada, más estrechos que la concesión general. ADR-0024 §5.2. Lo que declara se aplica; un par sin declarar se revoca.';

INSERT INTO excepciones_rls (tabla, rol, privilegios, motivo) VALUES
  ('privilegios_declarados', 'viajapro_app',     '{}', 'Declaración de control hermana de excepciones_rls (ADR-0024 §5.2). Escribible desde la aplicación, una fila manipulada se concedería sola en el siguiente despliegue.'),
  ('privilegios_declarados', 'viajapro_altas',   '{}', 'Declaración de control hermana de excepciones_rls (ADR-0024 §5.2). Escribible desde la aplicación, una fila manipulada se concedería sola en el siguiente despliegue.'),
  ('privilegios_declarados', 'viajapro_webhook', '{}', 'Declaración de control hermana de excepciones_rls (ADR-0024 §5.2). Escribible desde la aplicación, una fila manipulada se concedería sola en el siguiente despliegue.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

CREATE OR REPLACE FUNCTION aplicar_privilegios_declarados()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  -- Los tres roles de login de la aplicación (ADR-0008 §1.3). Reciben la MISMA concesión
  -- general sobre las tablas de negocio y se diferencian en qué funciones pueden ejecutar: el
  -- rol de conexión es lo único que una inyección SQL no falsea. Desde ADR-0024 §5.2, además,
  -- en las tablas declaradas en `privilegios_declarados` (§5.3), y solo en esas.
  roles_de_aplicacion CONSTANT text[] := ARRAY['viajapro_app', 'viajapro_altas', 'viajapro_webhook'];
  privilegios_validos CONSTANT text[] := ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
  rol_app   text;
  fila      record;
  declarada record;
  objetivo  record;
  privilegio text;
  lista     text;
  -- El rol con el que se entró, que NO es `current_user` una vez dentro del bucle.
  rol_sesion CONSTANT text := session_user;
BEGIN
  -- Guardia: concesión y vigilancia tienen que hablar del mismo conjunto.
  --
  -- Si un rol de aplicación recibe el GRANT general pero se queda fuera de
  -- `roles_de_login_vigilados`, nadie le revoca nada sobre las tablas globales y las
  -- aserciones dejan de preguntar por él. No hay forma de que eso produzca un error por
  -- sí solo, así que el error se produce aquí, a propósito, y detiene la migración.
  FOREACH rol_app IN ARRAY roles_de_aplicacion LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app)
       AND NOT EXISTS (SELECT 1 FROM roles_de_login_vigilados WHERE rolname = rol_app) THEN
      RAISE EXCEPTION
        'El rol de aplicación % existe pero no está vigilado: recibiría privilegios que nadie revoca. Revisa sus atributos (¿SUPERUSER, BYPASSRLS?).',
        rol_app;
    END IF;
  END LOOP;
  -- 5.1 Concesión general sobre todo lo que hay en el esquema.
  FOREACH rol_app IN ARRAY roles_de_aplicacion LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = rol_app) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', rol_app);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', rol_app);
      -- Las tablas que cree una migración futura también quedan cubiertas. El FOR ROLE
      -- no es decorativo: sin él, esto solo alcanza a los objetos creados por el rol que
      -- ejecuta la sentencia, y si mañana las migraciones corrieran con otro rol la
      -- cobertura desaparecería sin un solo error.
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
        current_user, rol_app);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
        current_user, rol_app);
    ELSE
      RAISE NOTICE 'El rol % no existe todavía; se omiten sus GRANT.', rol_app;
    END IF;
  END LOOP;

  -- PostgreSQL concede EXECUTE a PUBLIC en toda función nueva, sin que nadie escriba
  -- un GRANT. Es el gemelo del REVOKE de tablas y es igual de silencioso.
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
    current_user);

  -- 5.2 Revocación declarada, en el mismo bloque. Esto es lo que impide que lo
  -- anterior se lleve por delante el aislamiento de las tablas globales.
  -- Toda tabla declarada contra TODO rol de login vigilado. Un par sin declarar no
  -- se salta: se revoca entero. Lo que no está declarado no se concede.
  FOR fila IN
    SELECT tablas.tabla AS tabla,
           v.rolname    AS rol,
           COALESCE(e.privilegios, '{}'::text[]) AS privilegios
    FROM (SELECT DISTINCT tabla FROM excepciones_rls) tablas
    CROSS JOIN roles_de_login_vigilados v
    LEFT JOIN excepciones_rls e
           ON e.tabla = tablas.tabla AND e.rol = v.rolname
  LOOP
    -- La declaración es DATO, y el dato se valida antes de componer SQL con él.
    -- Esta tabla es superficie de confianza: una fila con basura en `privilegios`
    -- sería una inyección ejecutada con el rol que concede permisos.
    FOREACH privilegio IN ARRAY fila.privilegios LOOP
      IF NOT (privilegio = ANY (privilegios_validos)) THEN
        RAISE EXCEPTION 'excepciones_rls declara el privilegio inválido "%" para (%, %)',
          privilegio, fila.tabla, fila.rol;
      END IF;
    END LOOP;
    lista := array_to_string(fila.privilegios, ', ');

    -- La tabla declarada y todas sus particiones. Los nombres salen del catálogo,
    -- no de la declaración: aquí ya no hay entrada de usuario.
    FOR objetivo IN
      WITH RECURSIVE arbol AS (
        SELECT c.oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = fila.tabla AND c.relkind IN ('r', 'p')
        UNION ALL
        SELECT h.inhrelid
        FROM pg_inherits h
        JOIN arbol a ON a.oid = h.inhparent
      )
      SELECT a.oid::regclass::text AS nombre, pg_get_userbyid(c.relowner) AS dueno
      FROM arbol a
      JOIN pg_class c ON c.oid = a.oid
    LOOP
      -- Ver la sutileza (a) de la cabecera: sin esto el REVOKE es un no-op con aviso.
      --
      -- Se compara contra `session_user` y no contra `current_user`: dentro del bucle,
      -- después del primer `SET LOCAL ROLE`, `current_user` **es** el dueño, de modo que
      -- la condición de volver atrás era siempre falsa y la función retornaba con el rol
      -- puesto hasta el fin de la transacción. Hoy era inocuo de casualidad; la próxima
      -- sentencia que alguien añadiera después de la llamada se habría ejecutado como
      -- `viajapro_enrutador`.
      IF objetivo.dueno <> rol_sesion THEN
        EXECUTE format('SET LOCAL ROLE %I', objetivo.dueno);
      END IF;

      EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', objetivo.nombre, fila.rol);
      IF lista <> '' THEN
        EXECUTE format('GRANT %s ON TABLE %s TO %I', lista, objetivo.nombre, fila.rol);
      END IF;

      -- Incondicional: volver al rol de sesión no tiene coste y no depende de que la
      -- condición de arriba siga siendo correcta dentro de seis meses.
      EXECUTE 'RESET ROLE';
    END LOOP;
  END LOOP;

  -- 5.3 Privilegios estrechos declarados sobre tablas CON RLS (ADR-0024 §5.2), en el mismo
  -- bloque y con las mismas salvaguardas que 5.2: validación del dato, rol del dueño y descenso
  -- por particiones. Va DESPUÉS de 5.1, que acaba de concederlo todo: es lo que lo estrecha.
  --
  -- Las dos declaraciones son disjuntas. Una tabla en las dos sería a la vez «fuera de RLS» y
  -- «con RLS y privilegios estrechos»: el orden de los bucles decidiría cuál gana, en silencio.
  SELECT string_agg(DISTINCT d.tabla, ', ')
    INTO lista
    FROM privilegios_declarados d
    JOIN excepciones_rls e ON e.tabla = d.tabla;
  IF lista IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas declaradas a la vez en excepciones_rls y en privilegios_declarados: %', lista;
  END IF;

  FOR declarada IN SELECT DISTINCT tabla FROM privilegios_declarados ORDER BY 1 LOOP
    -- Esta declaración es para tablas aisladas. Una que no exista, o sin RLS habilitada y
    -- forzada, es una declaración que no protege lo que dice: se detiene la migración.
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = declarada.tabla
         AND c.relkind IN ('r', 'p') AND NOT c.relispartition
         AND c.relrowsecurity AND c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'privilegios_declarados nombra "%", que no existe en public o no tiene RLS habilitada y forzada.',
        declarada.tabla;
    END IF;
  END LOOP;

  -- Un rol declarado que existe pero no está vigilado sería una fila que el bucle ignora: la
  -- declaración diría algo que nadie aplica.
  FOR declarada IN
    SELECT DISTINCT d.rol FROM privilegios_declarados d
     WHERE EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname = d.rol)
       AND NOT EXISTS (SELECT 1 FROM roles_de_login_vigilados v WHERE v.rolname = d.rol)
  LOOP
    RAISE EXCEPTION 'privilegios_declarados declara el rol "%", que existe pero no es un rol de login vigilado.',
      declarada.rol;
  END LOOP;

  -- Toda tabla declarada contra TODO rol de login vigilado: un par sin declarar se revoca
  -- entero (también `viajapro_identidad`, que no recibe la concesión general, y el rol de login
  -- que se cree mañana).
  FOR fila IN
    SELECT tablas.tabla AS tabla,
           v.rolname    AS rol,
           COALESCE(d.privilegios, '{}'::text[]) AS privilegios
    FROM (SELECT DISTINCT tabla FROM privilegios_declarados) tablas
    CROSS JOIN roles_de_login_vigilados v
    LEFT JOIN privilegios_declarados d
           ON d.tabla = tablas.tabla AND d.rol = v.rolname
  LOOP
    FOREACH privilegio IN ARRAY fila.privilegios LOOP
      IF NOT (privilegio = ANY (privilegios_validos)) THEN
        RAISE EXCEPTION 'privilegios_declarados declara el privilegio inválido "%" para (%, %)',
          privilegio, fila.tabla, fila.rol;
      END IF;
    END LOOP;
    lista := array_to_string(fila.privilegios, ', ');

    FOR objetivo IN
      WITH RECURSIVE arbol AS (
        SELECT c.oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = fila.tabla AND c.relkind IN ('r', 'p')
        UNION ALL
        SELECT h.inhrelid
        FROM pg_inherits h
        JOIN arbol a ON a.oid = h.inhparent
      )
      SELECT a.oid::regclass::text AS nombre, pg_get_userbyid(c.relowner) AS dueno
      FROM arbol a
      JOIN pg_class c ON c.oid = a.oid
    LOOP
      IF objetivo.dueno <> rol_sesion THEN
        EXECUTE format('SET LOCAL ROLE %I', objetivo.dueno);
      END IF;

      EXECUTE format('REVOKE ALL ON TABLE %s FROM %I', objetivo.nombre, fila.rol);
      IF lista <> '' THEN
        EXECUTE format('GRANT %s ON TABLE %s TO %I', lista, objetivo.nombre, fila.rol);
      END IF;

      EXECUTE 'RESET ROLE';
    END LOOP;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION aplicar_privilegios_declarados() IS
  'Concede a los roles de aplicación, revoca lo declarado en excepciones_rls y estrecha lo declarado en privilegios_declarados, en el mismo bloque. ADR-0008 §1.2 y ADR-0024 §5.2.';

REVOKE ALL ON FUNCTION aplicar_privilegios_declarados() FROM PUBLIC;

-- Las filas de ADR-0024 §5.2. Ningún DELETE salvo en `pasajeros`: un archivo o una reserva se
-- cancelan, una entrega se marca. Los demás roles de login no se declaran: un par sin declarar se
-- revoca entero.
INSERT INTO privilegios_declarados (tabla, rol, privilegios, motivo) VALUES
  ('travel_files',        'viajapro_app', '{SELECT,INSERT,UPDATE}',
   'ADR-0024 §5.1: solo la API (y su despachador) toca el archivo de viaje. Sin DELETE: se cancela.'),
  ('bookings',            'viajapro_app', '{SELECT,INSERT,UPDATE}',
   'ADR-0024 §5.1: solo la API toca las reservas. Sin DELETE: se cancelan o se caen.'),
  ('pasajeros',           'viajapro_app', '{SELECT,INSERT,UPDATE,DELETE}',
   'ADR-0024 §5.1: solo la API toca los pasajeros. DELETE porque la lista se reemplaza entera.'),
  ('entregas_de_eventos', 'viajapro_app', '{SELECT,INSERT,UPDATE}',
   'ADR-0024 §1: el despachador corre en el proceso de la API con viajapro_app, nunca en el trabajador. Sin DELETE: la cascada del outbox corre como dueño.')
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 6. Cinturón: lo que esta migración dice haber hecho, comprobado contra el catálogo
--
-- Las mismas aserciones están en `tests/aislamiento.spec.ts` («T-240 — ADR-0024 F1»).
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  defectos text;
  v_tabla text;
  v_rol text;
  reales text[];
  esperados text[];
  tablas constant text[] := ARRAY['travel_files', 'bookings', 'pasajeros', 'entregas_de_eventos'];
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  FOREACH v_tabla IN ARRAY tablas LOOP
    -- RLS habilitada y FORZADA, con la política canónica (USING y WITH CHECK).
    IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
             WHERE oid = format('public.%I', v_tabla)::regclass) THEN
      RAISE EXCEPTION '% no tiene RLS habilitada y forzada.', v_tabla;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy p
                    WHERE p.polrelid = format('public.%I', v_tabla)::regclass
                      AND p.polname = 'tenant_isolation'
                      AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL) THEN
      RAISE EXCEPTION '% no tiene la política tenant_isolation con USING y WITH CHECK.', v_tabla;
    END IF;
    -- tenant_id NOT NULL.
    IF NOT (SELECT a.attnotnull FROM pg_attribute a
             WHERE a.attrelid = format('public.%I', v_tabla)::regclass
               AND a.attname = 'tenant_id' AND NOT a.attisdropped) THEN
      RAISE EXCEPTION '%.tenant_id admite nulos.', v_tabla;
    END IF;
    -- Ninguna es excepción global.
    IF EXISTS (SELECT 1 FROM excepciones_rls WHERE tabla = v_tabla) THEN
      RAISE EXCEPTION '% no puede ser una excepción de RLS.', v_tabla;
    END IF;
  END LOOP;

  -- Toda foránea DESDE o HACIA estas tablas entre dos tablas con tenant_id empareja el tenant de la
  -- hija con el del padre en la misma posición (barrido de la aserción 54).
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

  -- El SET NULL de la reserva anula SOLO mayorista_id (confdelsetcols), nunca tenant_id.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     WHERE c.conname = 'bookings_mayorista_id_tenant_id_fkey'
       AND c.conrelid = 'public.bookings'::regclass
       AND c.confdeltype = 'n'
       AND c.confdelsetcols = ARRAY[(SELECT attnum FROM pg_attribute
                                      WHERE attrelid = 'public.bookings'::regclass
                                        AND attname = 'mayorista_id')]::int2[]
  ) THEN
    RAISE EXCEPTION 'bookings_mayorista_id_tenant_id_fkey no es SET NULL ("mayorista_id").';
  END IF;

  -- La declaración: ninguna tabla a la vez en las dos, y la propia declaración es excepción sin
  -- privilegio para nadie.
  IF EXISTS (SELECT 1 FROM privilegios_declarados d JOIN excepciones_rls e ON e.tabla = d.tabla) THEN
    RAISE EXCEPTION 'Una tabla está a la vez en excepciones_rls y en privilegios_declarados.';
  END IF;
  IF (SELECT count(*) FROM excepciones_rls
       WHERE tabla = 'privilegios_declarados' AND privilegios = '{}'::text[]
         AND rol IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook')) <> 3 THEN
    RAISE EXCEPTION 'privilegios_declarados no está declarada en excepciones_rls sin privilegios para los tres roles.';
  END IF;

  -- La matriz de privilegios: EXACTA, por tabla y por rol de login vigilado o declarado (los que
  -- existan). `viajapro_app` lo declarado; todos los demás, nada. De tabla y de columna.
  FOR v_rol IN
    SELECT rolname FROM roles_de_login_vigilados
    UNION
    SELECT rolname FROM pg_roles
     WHERE rolname IN ('viajapro_app', 'viajapro_altas', 'viajapro_webhook', 'viajapro_identidad')
  LOOP
    FOREACH v_tabla IN ARRAY tablas LOOP
      SELECT COALESCE(array_agg(p ORDER BY p), '{}')
        INTO reales
        FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
       WHERE has_table_privilege(v_rol, format('public.%I', v_tabla), p);
      esperados := CASE
        WHEN v_rol <> 'viajapro_app' THEN '{}'::text[]
        WHEN v_tabla = 'pasajeros' THEN ARRAY['DELETE', 'INSERT', 'SELECT', 'UPDATE']
        ELSE ARRAY['INSERT', 'SELECT', 'UPDATE']
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
    END LOOP;
  END LOOP;

  -- Y PUBLIC, nada.
  FOREACH v_tabla IN ARRAY tablas LOOP
    IF has_table_privilege('public', format('public.%I', v_tabla), 'SELECT') THEN
      RAISE EXCEPTION 'PUBLIC puede leer %.', v_tabla;
    END IF;
  END LOOP;
END;
$$;
