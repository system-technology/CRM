-- Canales de WhatsApp: la verdad sobre la conexión de cada agencia.
--
-- Va PRIMERO, y el orden no es una preferencia: el directorio global de ADR-0008 coloca
-- una clave foránea compuesta `(canal_id, tenant_resuelto_id) REFERENCES canales(id,
-- tenant_id)`, y una clave foránea no puede apuntar a una tabla que no existe. El ADR lo
-- declara explícitamente: «la migración del directorio no puede aplicarse antes que la de
-- `canales`».
--
-- Son tablas de NEGOCIO: llevan tenant_id y RLS como todas. Aquí viven los
-- identificadores de Meta en claro y los tokens cifrados de terceros, bajo aislamiento.
-- El directorio es una proyección derivada de esto, con las claves en HMAC.

-- CreateEnum
CREATE TYPE "tipo_canal" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "estado_canal" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'REVOCADO');

-- CreateTable
CREATE TABLE "cuentas_whatsapp" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "waba_id" VARCHAR(32) NOT NULL,
    "nombre" VARCHAR(200),
    "estado" "estado_canal" NOT NULL DEFAULT 'ACTIVO',
    "token_cifrado" BYTEA,
    "token_nonce" BYTEA,
    "token_tag" BYTEA,
    "clave_version" SMALLINT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "eliminado_en" TIMESTAMPTZ(3),
    "creado_por" UUID,
    "actualizado_por" UUID,

    CONSTRAINT "cuentas_whatsapp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "tipo" "tipo_canal" NOT NULL DEFAULT 'WHATSAPP',
    "phone_number_id" VARCHAR(32) NOT NULL,
    "numero_e164" VARCHAR(20) NOT NULL,
    "nombre_visible" VARCHAR(200),
    "estado" "estado_canal" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "revocado_en" TIMESTAMPTZ(3),
    "eliminado_en" TIMESTAMPTZ(3),
    "creado_por" UUID,
    "actualizado_por" UUID,

    CONSTRAINT "canales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cuentas_whatsapp_tenant_id_estado_idx" ON "cuentas_whatsapp"("tenant_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_whatsapp_id_tenant_id_key" ON "cuentas_whatsapp"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_whatsapp_tenant_id_waba_id_key" ON "cuentas_whatsapp"("tenant_id", "waba_id");

-- CreateIndex
CREATE INDEX "canales_tenant_id_estado_idx" ON "canales"("tenant_id", "estado");

-- CreateIndex
CREATE INDEX "canales_tenant_id_cuenta_id_idx" ON "canales"("tenant_id", "cuenta_id");

-- CreateIndex
CREATE UNIQUE INDEX "canales_id_tenant_id_key" ON "canales"("id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "canales_tenant_id_phone_number_id_key" ON "canales"("tenant_id", "phone_number_id");

-- AddForeignKey
ALTER TABLE "cuentas_whatsapp" ADD CONSTRAINT "cuentas_whatsapp_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canales" ADD CONSTRAINT "canales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La clave foránea COMPUESTA, no simple: un canal no puede colgar de la cuenta de otro
-- tenant. Escrita simple sigue funcionando y nadie lo nota hasta que una fila cruza
-- agencias. Es el patrón de toda referencia cruzada entre tablas con tenant.
-- AddForeignKey
ALTER TABLE "canales" ADD CONSTRAINT "canales_cuenta_id_tenant_id_fkey" FOREIGN KEY ("cuenta_id", "tenant_id") REFERENCES "cuentas_whatsapp"("id", "tenant_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Comentarios: lo que no se puede deducir leyendo las columnas.
COMMENT ON TABLE cuentas_whatsapp IS
  'Cuenta de WhatsApp Business (WABA) de una agencia. El token de negocio del canje se emite sobre el WABA, no sobre un número.';
COMMENT ON TABLE canales IS
  'Un número de WhatsApp conectado. El phone_number_id es un atributo reasignable, NUNCA la clave: Meta no lo conserva si el número se borra y se vuelve a añadir.';
COMMENT ON COLUMN canales.phone_number_id IS
  'Identificador de Meta en claro, bajo RLS. En el directorio global vive en HMAC con pimienta. ADR-0008 §1.1.';

-- RLS, por el mismo mecanismo dirigido por datos que el resto. Se invoca explícitamente
-- aquí para que estas tablas no pasen ni un instante sin política, aunque la migración de
-- políticas vuelva a aplicarla después sobre todo el esquema.
SELECT aplicar_aislamiento_tenant('cuentas_whatsapp');
SELECT aplicar_aislamiento_tenant('canales');
