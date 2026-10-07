-- CreateEnum
CREATE TYPE "estado_tenant" AS ENUM ('EN_PRUEBA', 'ACTIVO', 'SUSPENDIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('DUENO', 'ADMINISTRADOR', 'ASESOR', 'SOLO_LECTURA');

-- CreateEnum
CREATE TYPE "entidad_personalizable" AS ENUM ('CONTACTO', 'VIAJERO', 'OPORTUNIDAD', 'ARCHIVO_VIAJE');

-- CreateEnum
CREATE TYPE "tipo_campo_personalizado" AS ENUM ('TEXTO', 'NUMERO', 'FECHA', 'BOOLEANO', 'SELECCION', 'SELECCION_MULTIPLE');

-- CreateEnum
CREATE TYPE "plan_alimentacion" AS ENUM ('TODO_INCLUIDO', 'DESAYUNO', 'MEDIA_PENSION', 'PENSION_COMPLETA', 'SIN_ALIMENTACION');

-- CreateEnum
CREATE TYPE "acomodacion" AS ENUM ('SENCILLA', 'DOBLE', 'TRIPLE', 'CUADRUPLE');

-- CreateEnum
CREATE TYPE "tipo_pasajero" AS ENUM ('ADT', 'CHD', 'INF');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(63) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "pais_iso" CHAR(2) NOT NULL DEFAULT 'CO',
    "moneda_iso" CHAR(3) NOT NULL DEFAULT 'COP',
    "zona_horaria" VARCHAR(64) NOT NULL DEFAULT 'America/Bogota',
    "estado" "estado_tenant" NOT NULL DEFAULT 'EN_PRUEBA',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monedas" (
    "codigo_iso" CHAR(3) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "decimales" SMALLINT NOT NULL,

    CONSTRAINT "monedas_pkey" PRIMARY KEY ("codigo_iso")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "correo" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "hash_contrasena" VARCHAR(255),
    "rol" "rol_usuario" NOT NULL DEFAULT 'ASESOR',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acceso_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapas_pipeline" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "orden" SMALLINT NOT NULL,
    "probabilidad" SMALLINT NOT NULL DEFAULT 0,
    "es_ganada" BOOLEAN NOT NULL DEFAULT false,
    "es_perdida" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapas_pipeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "definiciones_campo_personalizado" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entidad" "entidad_personalizable" NOT NULL,
    "clave" VARCHAR(64) NOT NULL,
    "etiqueta" VARCHAR(120) NOT NULL,
    "tipo" "tipo_campo_personalizado" NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT false,
    "orden" SMALLINT NOT NULL DEFAULT 0,
    "opciones" JSONB,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "definiciones_campo_personalizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mayoristas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "proveedor_canonico_id" UUID,
    "contacto_nombre" VARCHAR(200),
    "contacto_correo" VARCHAR(255),
    "contacto_telefono" VARCHAR(32),
    "dias_time_limit" SMALLINT,
    "notas" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),

    CONSTRAINT "mayoristas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paquetes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mayorista_id" UUID,
    "nombre" VARCHAR(200) NOT NULL,
    "destino" VARCHAR(120) NOT NULL,
    "pais_iso" CHAR(2),
    "dias" SMALLINT NOT NULL,
    "noches" SMALLINT NOT NULL,
    "plan_alimentacion" "plan_alimentacion" NOT NULL,
    "inclusiones" JSONB NOT NULL DEFAULT '[]',
    "exclusiones" JSONB NOT NULL DEFAULT '[]',
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),

    CONSTRAINT "paquetes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporadas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paquete_id" UUID NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "desde" DATE NOT NULL,
    "hasta" DATE NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "temporadas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "precios" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "temporada_id" UUID NOT NULL,
    "acomodacion" "acomodacion" NOT NULL,
    "tipo_pasajero" "tipo_pasajero" NOT NULL,
    "neto_unidades" BIGINT NOT NULL,
    "venta_unidades" BIGINT NOT NULL,
    "moneda_iso" CHAR(3) NOT NULL,
    "edad_minima" SMALLINT,
    "edad_maxima" SMALLINT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "precios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salidas" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "paquete_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "cupo_total" SMALLINT,
    "cupo_vendido" SMALLINT NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salidas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contactos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "telefono_e164" VARCHAR(20) NOT NULL,
    "nombre" VARCHAR(200),
    "correo" VARCHAR(255),
    "consentimiento_en" TIMESTAMPTZ(3),
    "consentimiento_canal" VARCHAR(40),
    "consentimiento_revocado_en" TIMESTAMPTZ(3),
    "campos_personalizados" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),

    CONSTRAINT "contactos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oportunidades" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contacto_id" UUID NOT NULL,
    "etapa_id" UUID NOT NULL,
    "asesor_id" UUID,
    "titulo" VARCHAR(200) NOT NULL,
    "destino" VARCHAR(120),
    "fecha_viaje_desde" DATE,
    "fecha_viaje_hasta" DATE,
    "adultos" SMALLINT,
    "ninos" SMALLINT,
    "infantes" SMALLINT,
    "valor_estimado_unidades" BIGINT,
    "moneda_iso" CHAR(3),
    "motivo_perdida" VARCHAR(200),
    "campos_personalizados" JSONB NOT NULL DEFAULT '{}',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "cerrada_en" TIMESTAMPTZ(3),
    "eliminado_en" TIMESTAMPTZ(3),

    CONSTRAINT "oportunidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "usuario_id" UUID,
    "accion" VARCHAR(80) NOT NULL,
    "entidad" VARCHAR(80) NOT NULL,
    "entidad_id" UUID,
    "detalle" JSONB,
    "ip" INET,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "agregado" VARCHAR(80) NOT NULL,
    "agregado_id" UUID NOT NULL,
    "tipo_evento" VARCHAR(120) NOT NULL,
    "version_evento" SMALLINT NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publicado_en" TIMESTAMPTZ(3),
    "intentos" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "usuarios_tenant_id_activo_idx" ON "usuarios"("tenant_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenant_id_correo_key" ON "usuarios"("tenant_id", "correo");

-- CreateIndex
CREATE INDEX "etapas_pipeline_tenant_id_idx" ON "etapas_pipeline"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "etapas_pipeline_tenant_id_orden_key" ON "etapas_pipeline"("tenant_id", "orden");

-- CreateIndex
CREATE INDEX "definiciones_campo_personalizado_tenant_id_entidad_idx" ON "definiciones_campo_personalizado"("tenant_id", "entidad");

-- CreateIndex
CREATE UNIQUE INDEX "definiciones_campo_personalizado_tenant_id_entidad_clave_key" ON "definiciones_campo_personalizado"("tenant_id", "entidad", "clave");

-- CreateIndex
CREATE INDEX "mayoristas_tenant_id_eliminado_en_idx" ON "mayoristas"("tenant_id", "eliminado_en");

-- CreateIndex
CREATE INDEX "mayoristas_tenant_id_nombre_idx" ON "mayoristas"("tenant_id", "nombre");

-- CreateIndex
CREATE INDEX "paquetes_tenant_id_activo_eliminado_en_idx" ON "paquetes"("tenant_id", "activo", "eliminado_en");

-- CreateIndex
CREATE INDEX "paquetes_tenant_id_destino_idx" ON "paquetes"("tenant_id", "destino");

-- CreateIndex
CREATE INDEX "temporadas_tenant_id_paquete_id_idx" ON "temporadas"("tenant_id", "paquete_id");

-- CreateIndex
CREATE INDEX "temporadas_tenant_id_desde_hasta_idx" ON "temporadas"("tenant_id", "desde", "hasta");

-- CreateIndex
CREATE INDEX "precios_tenant_id_temporada_id_idx" ON "precios"("tenant_id", "temporada_id");

-- CreateIndex
CREATE UNIQUE INDEX "precios_tenant_id_temporada_id_acomodacion_tipo_pasajero_ed_key" ON "precios"("tenant_id", "temporada_id", "acomodacion", "tipo_pasajero", "edad_minima", "edad_maxima");

-- CreateIndex
CREATE INDEX "salidas_tenant_id_fecha_activa_idx" ON "salidas"("tenant_id", "fecha", "activa");

-- CreateIndex
CREATE UNIQUE INDEX "salidas_tenant_id_paquete_id_fecha_key" ON "salidas"("tenant_id", "paquete_id", "fecha");

-- CreateIndex
CREATE INDEX "contactos_tenant_id_eliminado_en_idx" ON "contactos"("tenant_id", "eliminado_en");

-- CreateIndex
CREATE UNIQUE INDEX "contactos_tenant_id_telefono_e164_key" ON "contactos"("tenant_id", "telefono_e164");

-- CreateIndex
CREATE INDEX "oportunidades_tenant_id_etapa_id_actualizado_en_idx" ON "oportunidades"("tenant_id", "etapa_id", "actualizado_en" DESC);

-- CreateIndex
CREATE INDEX "oportunidades_tenant_id_asesor_id_idx" ON "oportunidades"("tenant_id", "asesor_id");

-- CreateIndex
CREATE INDEX "oportunidades_tenant_id_contacto_id_idx" ON "oportunidades"("tenant_id", "contacto_id");

-- CreateIndex
CREATE INDEX "registros_auditoria_tenant_id_ocurrido_en_idx" ON "registros_auditoria"("tenant_id", "ocurrido_en" DESC);

-- CreateIndex
CREATE INDEX "registros_auditoria_tenant_id_entidad_entidad_id_idx" ON "registros_auditoria"("tenant_id", "entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "idx_outbox_pendientes" ON "outbox"("ocurrido_en");

-- CreateIndex
CREATE INDEX "outbox_tenant_id_agregado_agregado_id_idx" ON "outbox"("tenant_id", "agregado", "agregado_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapas_pipeline" ADD CONSTRAINT "etapas_pipeline_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "definiciones_campo_personalizado" ADD CONSTRAINT "definiciones_campo_personalizado_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mayoristas" ADD CONSTRAINT "mayoristas_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paquetes" ADD CONSTRAINT "paquetes_mayorista_id_fkey" FOREIGN KEY ("mayorista_id") REFERENCES "mayoristas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporadas" ADD CONSTRAINT "temporadas_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "paquetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "precios" ADD CONSTRAINT "precios_temporada_id_fkey" FOREIGN KEY ("temporada_id") REFERENCES "temporadas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salidas" ADD CONSTRAINT "salidas_paquete_id_fkey" FOREIGN KEY ("paquete_id") REFERENCES "paquetes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_contacto_id_fkey" FOREIGN KEY ("contacto_id") REFERENCES "contactos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_etapa_id_fkey" FOREIGN KEY ("etapa_id") REFERENCES "etapas_pipeline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_asesor_id_fkey" FOREIGN KEY ("asesor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
