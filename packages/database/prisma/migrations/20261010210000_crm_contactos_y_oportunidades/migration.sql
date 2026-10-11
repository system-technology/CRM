-- =============================================================================
-- CRM — contactos y oportunidades que sirven los contratos de `packages/contracts/src/crm.ts`
--
-- Qué hace, en una frase: deja de ser maqueta la pantalla de pipeline, con el aislamiento
-- entre agencias reforzado por el motor y no por el `WHERE` de nadie.
--
-- Cuatro cosas que no son cosméticas:
--
--   1. **Las claves foráneas de `oportunidades` pasan a ser COMPUESTAS con el tenant.**
--      Estaban escritas simples, y escritas simples la oportunidad de una agencia puede
--      colgar del contacto, de la etapa o del asesor de OTRA: la integridad referencial se
--      comprueba por encima de las políticas RLS, así que nada lo impedía y nadie se
--      enteraría hasta que una fila cruzara agencias. Es el mismo defecto que ADR-0008
--      cerró en `enrutamiento_canales`, aplicado al CRM. Aserciones 26 y 27.
--
--   2. **El consentimiento deja de ser tres columnas y pasa a ser tabla.** La Ley 1581 de
--      2012 no pide saber si hay consentimiento: pide demostrar cuándo, con qué finalidad y
--      por qué canal se obtuvo, y que la revocación quede registrada. Tres columnas
--      sobrescribibles no demuestran nada.
--
--   3. **El motivo de pérdida pasa de texto libre a enum.** «precio», «Precio», «muy caro»
--      y «PRECIO» son cuatro motivos distintos para una consulta de embudo, que es lo único
--      para lo que existe el campo.
--
--   4. **Búsqueda de contactos con trigramas y sin acentos.** `LIKE '%ana%'` sobre nombre
--      recorre la tabla entera; con `pg_trgm` + `btree_gin` el filtro de tenant y el texto
--      entran en el MISMO índice. `preferencias` queda deliberadamente fuera: ver R10 abajo.
--
-- REVERSIBILIDAD — **esta migración NO es reversible sin pérdida.** Suelta
-- `contactos.consentimiento_en`, `consentimiento_canal` y `consentimiento_revocado_en`
-- (migradas a `consentimientos_contacto`) y reescribe `oportunidades.motivo_perdida` de
-- texto a enum. Plan de reversión: recrear las tres columnas y repoblarlas desde
-- `consentimientos_contacto` —que es un superconjunto estricto—, y recrear `motivo_perdida`
-- como `varchar(200)` con el nombre del valor del enum. Lo que no se recupera es un texto
-- libre que no mapee a ningún valor del enum; antes de soltarlo se comprueba que no exista
-- ninguno y la migración ABORTA si lo hay.
--
-- SEGURIDAD EN CALIENTE: las tablas del CRM están vacías o casi (el producto no tiene
-- clientes en producción). Aun así se sigue el protocolo: columna nueva siempre `NULL`able,
-- relleno, y restricción después. Los dos `ALTER TABLE ... ADD CONSTRAINT ... NOT VALID` +
-- `VALIDATE CONSTRAINT` evitan el bloqueo de lectura que sí tendría una validación directa.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Extensiones de búsqueda.
--
-- `unaccent` no es IMMUTABLE —depende de un diccionario que se puede recargar—, y
-- PostgreSQL no indexa lo que no es inmutable. El envoltorio de abajo lo declara inmutable
-- a sabiendas: el diccionario de esta base no cambia, y si cambiara habría que REINDEXAR.
-- El `search_path` vacío es obligatorio en una función que va dentro de un índice: sin él,
-- quien pudiera crear un esquema por delante decidiría qué `unaccent` se ejecuta.
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS btree_gin;

CREATE OR REPLACE FUNCTION public.inmutable_unaccent(texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SET search_path = ''
AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, texto) $$;

COMMENT ON FUNCTION public.inmutable_unaccent(text) IS
  'unaccent envuelto como IMMUTABLE para poder indexarlo. Si se recarga el diccionario, REINDEX.';

-- -----------------------------------------------------------------------------
-- 1. Tipos del dominio.
--
-- `motivo_perdida` es enum del MOTOR y no tabla por tenant, al revés que las etapas. No es
-- incoherencia: la etapa es el proceso de venta de cada agencia —R12, política de negocio—,
-- mientras que el motivo de pérdida es la taxonomía con la que se compara el rendimiento
-- ENTRE agencias y se decide si hay que tocar el markup o el SLA. Si cada una inventa la
-- suya, esa comparación deja de existir. Y «OTRO» con explicación obligatoria es la válvula
-- que evita el caso en el que la taxonomía fija estorbaría.
-- -----------------------------------------------------------------------------
CREATE TYPE "motivo_perdida" AS ENUM (
  'PRECIO', 'TIEMPO_DE_RESPUESTA', 'SIN_DISPONIBILIDAD', 'COMPRO_EN_OTRA_AGENCIA',
  'VIAJE_APLAZADO', 'NO_RESPONDE', 'OTRO'
);

CREATE TYPE "consentimiento" AS ENUM ('TRANSACCIONAL', 'PROMOCIONAL');

-- -----------------------------------------------------------------------------
-- 2. `etapas_pipeline` gana `clave`: el puente entre la tabla por tenant y el enum cerrado
--    del contrato. Dos pasos (nullable → relleno → NOT NULL) aunque la tabla sea diminuta,
--    porque el protocolo no se practica el día que la tabla es grande.
-- -----------------------------------------------------------------------------
ALTER TABLE "etapas_pipeline" ADD COLUMN "clave" VARCHAR(32);

-- NULLable, y no es dejadez: el contrato cierra el embudo en CINCO etapas y la tabla puede
-- tener más —la agencia demo tenía siete. Una etapa sin `clave` existe en la base y HOY no
-- es representable en la API. Forzarla a un valor habría metido dos etapas distintas en la
-- misma columna del tablero, que es peor que decir la verdad. Lo que decide qué hacer con
-- ellas es el contrato, no esta migración.
WITH ordenadas AS (
  SELECT "id",
         row_number() OVER (PARTITION BY "tenant_id" ORDER BY "orden") AS rn
    FROM "etapas_pipeline"
   WHERE NOT "es_ganada" AND NOT "es_perdida"
)
UPDATE "etapas_pipeline" e
   SET "clave" = CASE o.rn WHEN 1 THEN 'NUEVO_LEAD' WHEN 2 THEN 'EN_COTIZACION'
                           WHEN 3 THEN 'EN_NEGOCIACION' ELSE NULL END
  FROM ordenadas o
 WHERE e."id" = o."id";

WITH terminales AS (
  SELECT "id", "es_ganada",
         row_number() OVER (PARTITION BY "tenant_id", "es_ganada" ORDER BY "orden") AS rn
    FROM "etapas_pipeline"
   WHERE "es_ganada" OR "es_perdida"
)
UPDATE "etapas_pipeline" e
   SET "clave" = CASE WHEN t."es_ganada" THEN 'GANADA' ELSE 'PERDIDA' END
  FROM terminales t
 WHERE e."id" = t."id" AND t.rn = 1;

ALTER TABLE "etapas_pipeline"
  ADD CONSTRAINT "etapas_pipeline_clave_del_contrato" CHECK (
    "clave" IS NULL OR "clave" IN ('NUEVO_LEAD', 'EN_COTIZACION', 'EN_NEGOCIACION', 'GANADA', 'PERDIDA')
  ) NOT VALID;
ALTER TABLE "etapas_pipeline" VALIDATE CONSTRAINT "etapas_pipeline_clave_del_contrato";

-- Parcial: una clave del contrato como mucho por agencia, y tantas etapas sin clave como
-- la agencia quiera.
CREATE UNIQUE INDEX "etapas_pipeline_tenant_id_clave_key"
  ON "etapas_pipeline" ("tenant_id", "clave") WHERE "clave" IS NOT NULL;
CREATE UNIQUE INDEX "etapas_pipeline_id_tenant_id_key" ON "etapas_pipeline" ("id", "tenant_id");

COMMENT ON COLUMN "etapas_pipeline"."clave" IS
  'Mapea la fila al valor del enum EtapaPipeline del contrato. El CHECK se suelta el dia que el contrato abra las etapas.';

-- -----------------------------------------------------------------------------
-- 3. Unicidades compuestas que hacen posible la clave foránea compuesta.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "usuarios_id_tenant_id_key"  ON "usuarios"  ("id", "tenant_id");
CREATE UNIQUE INDEX "paquetes_id_tenant_id_key"  ON "paquetes"  ("id", "tenant_id");
CREATE UNIQUE INDEX "contactos_id_tenant_id_key" ON "contactos" ("id", "tenant_id");
CREATE UNIQUE INDEX "oportunidades_id_tenant_id_key" ON "oportunidades" ("id", "tenant_id");

-- -----------------------------------------------------------------------------
-- 4. `contactos`: lo que el contrato pide y la base no tenía.
-- -----------------------------------------------------------------------------
ALTER TABLE "contactos"
  ADD COLUMN "etiquetas"          TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "preferencias"       VARCHAR(2000),
  ADD COLUMN "ultimo_contacto_en" TIMESTAMPTZ(3),
  ADD COLUMN "creado_por"         UUID,
  ADD COLUMN "actualizado_por"    UUID;

-- Ampliar un varchar NO reescribe la tabla ni bloquea lecturas. Reducirlo sí: por eso esto
-- solo puede ir en esta dirección.
ALTER TABLE "contactos" ALTER COLUMN "correo" TYPE VARCHAR(320);

-- El contrato limita a 20 etiquetas de 40 caracteres. Se comprueba aquí y no solo en Zod
-- porque es una cota de ALMACENAMIENTO: un arreglo sin tope es una vía abierta a llenar la
-- fila —y el índice GIN— desde cualquier cliente que algún día escriba sin pasar por la API.
--
-- Lo que se comprueba es el NÚMERO de etiquetas, que no haya etiquetas vacías y el tamaño
-- total. El tope exacto de 40 caracteres POR etiqueta se queda en el contrato: expresarlo
-- aquí exigiría una subconsulta (`unnest`), y PostgreSQL no las admite en un CHECK. La cota
-- de 840 es la misma cota por otro camino: 20 × 40 + 19 separadores.
ALTER TABLE "contactos"
  ADD CONSTRAINT "contactos_etiquetas_acotadas" CHECK (
    cardinality("etiquetas") <= 20
    AND '' <> ALL ("etiquetas")
    AND length(array_to_string("etiquetas", ',')) <= 839
  ) NOT VALID;
ALTER TABLE "contactos" VALIDATE CONSTRAINT "contactos_etiquetas_acotadas";

COMMENT ON COLUMN "contactos"."preferencias" IS
  'R10 - dato potencialmente sensible (una alergia es dato de salud). Fuera del indice de busqueda y fuera de registros_auditoria.detalle.';

-- -----------------------------------------------------------------------------
-- 5. `consentimientos_contacto`: la prueba, no la casilla.
-- -----------------------------------------------------------------------------
CREATE TABLE "consentimientos_contacto" (
  "id"          UUID NOT NULL,
  "tenant_id"   UUID NOT NULL,
  "contacto_id" UUID NOT NULL,
  "finalidad"   "consentimiento" NOT NULL,
  "prueba"      VARCHAR(200) NOT NULL,
  "canal"       VARCHAR(40),
  "otorgado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "revocado_en" TIMESTAMPTZ(3),
  "registrado_por" UUID,

  CONSTRAINT "consentimientos_contacto_pkey" PRIMARY KEY ("id")
);

-- PARCIAL a propósito: una finalidad VIGENTE por contacto, y el histórico de las revocadas
-- se conserva entero. Una unicidad total impediría volver a otorgar lo que se revocó, que
-- es justo lo que la ley contempla.
CREATE UNIQUE INDEX "ux_consentimiento_vigente"
  ON "consentimientos_contacto" ("tenant_id", "contacto_id", "finalidad")
  WHERE "revocado_en" IS NULL;

CREATE INDEX "consentimientos_contacto_tenant_id_contacto_id_idx"
  ON "consentimientos_contacto" ("tenant_id", "contacto_id");

-- Migrar lo que había. El consentimiento viejo era implícitamente TRANSACCIONAL: era el
-- permiso para responderle a quien escribió, nunca para enviarle una campaña.
INSERT INTO "consentimientos_contacto"
  ("id", "tenant_id", "contacto_id", "finalidad", "prueba", "canal", "otorgado_en", "revocado_en")
SELECT gen_random_uuid(), c."tenant_id", c."id", 'TRANSACCIONAL',
       'migrado-de-contactos.consentimiento_en', c."consentimiento_canal",
       c."consentimiento_en", c."consentimiento_revocado_en"
FROM "contactos" c
WHERE c."consentimiento_en" IS NOT NULL;

ALTER TABLE "contactos"
  DROP COLUMN "consentimiento_en",
  DROP COLUMN "consentimiento_canal",
  DROP COLUMN "consentimiento_revocado_en";

-- -----------------------------------------------------------------------------
-- 6. `notas_internas`: lo que el asesor escribe y el cliente no ve jamás.
--
-- Cuelga del CONTACTO y no de la conversación: la conversación todavía no existe como
-- tabla, y el panel lateral las pide por contacto. Cuando el inbox cree `conversaciones`,
-- añadir `conversacion_id UUID NULL` con clave foránea compuesta es una migración aditiva
-- de un minuto. Al revés —colgarlas de la conversación— habría forzado al inbox a existir
-- antes que el pipeline.
-- -----------------------------------------------------------------------------
CREATE TABLE "notas_internas" (
  "id"           UUID NOT NULL,
  "tenant_id"    UUID NOT NULL,
  "contacto_id"  UUID NOT NULL,
  "autor_id"     UUID,
  "texto"        VARCHAR(2000) NOT NULL,
  "escrita_en"   TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  "eliminada_en" TIMESTAMPTZ(3),

  CONSTRAINT "notas_internas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notas_internas_tenant_id_contacto_id_escrita_en_idx"
  ON "notas_internas" ("tenant_id", "contacto_id", "escrita_en" DESC);

-- -----------------------------------------------------------------------------
-- 7. `oportunidades`: los campos del contrato que faltaban.
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidades"
  ADD COLUMN "paquete_id"                UUID,
  ADD COLUMN "probabilidad"              SMALLINT,
  ADD COLUMN "proxima_tarea_descripcion" VARCHAR(200),
  ADD COLUMN "proxima_tarea_vence_en"    TIMESTAMPTZ(3),
  ADD COLUMN "proxima_tarea_completada"  BOOLEAN,
  ADD COLUMN "nota_perdida"              VARCHAR(500),
  ADD COLUMN "ultimo_contacto_en"        TIMESTAMPTZ(3),
  ADD COLUMN "creado_por"                UUID,
  ADD COLUMN "actualizado_por"           UUID;

-- De texto libre a enum, SIN reescribir la tabla: columna nueva, relleno, soltar, renombrar.
-- Un `ALTER COLUMN ... TYPE` habría reescrito la tabla entera bajo ACCESS EXCLUSIVE.
--
-- Antes de soltar nada: si hay un texto que no mapea a ningún valor del enum, esto ABORTA.
-- Perder el «por qué se perdió» de una agencia en silencio sería exactamente lo que el
-- campo existe para impedir.
DO $$
DECLARE
  huerfanos int;
BEGIN
  SELECT count(*) INTO huerfanos
  FROM "oportunidades"
  WHERE "motivo_perdida" IS NOT NULL
    AND upper(btrim("motivo_perdida")) NOT IN (
      'PRECIO','TIEMPO_DE_RESPUESTA','SIN_DISPONIBILIDAD','COMPRO_EN_OTRA_AGENCIA',
      'VIAJE_APLAZADO','NO_RESPONDE','OTRO'
    );
  IF huerfanos > 0 THEN
    RAISE EXCEPTION
      'Hay % motivos de perdida en texto libre que no mapean al enum. Migralos a mano antes de aplicar esto: lo que no mapea se perderia en silencio.',
      huerfanos;
  END IF;
END;
$$;

ALTER TABLE "oportunidades" ADD COLUMN "motivo_perdida_cod" "motivo_perdida";
UPDATE "oportunidades"
   SET "motivo_perdida_cod" = upper(btrim("motivo_perdida"))::"motivo_perdida"
 WHERE "motivo_perdida" IS NOT NULL;
ALTER TABLE "oportunidades" DROP COLUMN "motivo_perdida";
ALTER TABLE "oportunidades" RENAME COLUMN "motivo_perdida_cod" TO "motivo_perdida";

-- LA REGLA DE PÉRDIDA, la mitad que un CHECK puede sostener.
--
-- El contrato exige tres cosas: (a) perdida => hay motivo, (b) motivo => está perdida,
-- (c) OTRO => hay explicación. Aquí van (c) y la coherencia de la nota, que son
-- comprobaciones de LA FILA. (a) y (b) no pueden ser un CHECK: la etapa vive en
-- `etapas_pipeline` —es tabla por tenant, no enum— y un CHECK no puede mirar otra tabla.
-- Hacerlo con un disparador que consulte `etapas_pipeline` en cada escritura sería meter
-- una regla de negocio en el sitio donde nadie la busca y pagarla en cada movimiento de
-- tarjeta. (a) y (b) se quedan en el contrato, que las aplica a la web, a la API y a
-- cualquier integración futura. Ver el informe.
ALTER TABLE "oportunidades"
  ADD CONSTRAINT "oportunidades_motivo_otro_exige_nota" CHECK (
    ("motivo_perdida" IS DISTINCT FROM 'OTRO' OR btrim(COALESCE("nota_perdida", '')) <> '')
    AND ("nota_perdida" IS NULL OR "motivo_perdida" IS NOT NULL)
  ) NOT VALID;
ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_motivo_otro_exige_nota";

ALTER TABLE "oportunidades"
  ADD CONSTRAINT "oportunidades_probabilidad_0_100" CHECK (
    "probabilidad" IS NULL OR "probabilidad" BETWEEN 0 AND 100
  ) NOT VALID;
ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_probabilidad_0_100";

-- La próxima tarea es las tres columnas o ninguna. Media tarea —una descripción sin fecha—
-- no se puede pintar ni se puede vencer: es una fila que miente.
ALTER TABLE "oportunidades"
  ADD CONSTRAINT "oportunidades_proxima_tarea_completa" CHECK (
    num_nonnulls("proxima_tarea_descripcion", "proxima_tarea_vence_en", "proxima_tarea_completada") IN (0, 3)
  ) NOT VALID;
ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_proxima_tarea_completa";

-- Dinero: entero de 64 bits + ISO-4217, y los dos o ninguno. R8. Una cifra sin moneda no
-- es dinero, es un número; y en multi-moneda esa confusión se cobra en TRM.
ALTER TABLE "oportunidades"
  ADD CONSTRAINT "oportunidades_valor_con_moneda" CHECK (
    num_nonnulls("valor_estimado_unidades", "moneda_iso") IN (0, 2)
  ) NOT VALID;
ALTER TABLE "oportunidades" VALIDATE CONSTRAINT "oportunidades_valor_con_moneda";

-- -----------------------------------------------------------------------------
-- 8. Las claves foráneas, TODAS compuestas con el tenant.
--
-- Esto es lo que impide que la oportunidad de una agencia cuelgue de la ficha, de la etapa,
-- del asesor o del paquete de otra. RLS no lo impide: la integridad referencial se
-- comprueba por encima de las políticas. Aserciones 26 a 29.
--
-- `ON DELETE RESTRICT` donde la referencia es opcional, y no `SET NULL`: la clave lleva
-- `tenant_id`, que es NOT NULL, y PostgreSQL no puede anular media clave.
-- -----------------------------------------------------------------------------
ALTER TABLE "oportunidades" DROP CONSTRAINT IF EXISTS "oportunidades_contacto_id_fkey";
ALTER TABLE "oportunidades" DROP CONSTRAINT IF EXISTS "oportunidades_etapa_id_fkey";
ALTER TABLE "oportunidades" DROP CONSTRAINT IF EXISTS "oportunidades_asesor_id_fkey";

ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_etapa_id_tenant_id_fkey"
  FOREIGN KEY ("etapa_id", "tenant_id") REFERENCES "etapas_pipeline" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_asesor_id_tenant_id_fkey"
  FOREIGN KEY ("asesor_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_paquete_id_tenant_id_fkey"
  FOREIGN KEY ("paquete_id", "tenant_id") REFERENCES "paquetes" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "oportunidades" ADD CONSTRAINT "oportunidades_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "contactos" ADD CONSTRAINT "contactos_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "consentimientos_contacto" ADD CONSTRAINT "consentimientos_contacto_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consentimientos_contacto" ADD CONSTRAINT "consentimientos_contacto_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "consentimientos_contacto" ADD CONSTRAINT "consentimientos_contacto_registrado_por_tenant_id_fkey"
  FOREIGN KEY ("registrado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_autor_id_tenant_id_fkey"
  FOREIGN KEY ("autor_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 9. Índices de las rutas calientes.
--
-- El filtro de tenant va SIEMPRE primero: es el predicado que toda consulta lleva, lo pone
-- RLS aunque el programador lo olvide, y ponerlo segundo desperdicia el índice.
-- -----------------------------------------------------------------------------
CREATE INDEX "contactos_tenant_id_ultimo_contacto_en_idx"
  ON "contactos" ("tenant_id", "ultimo_contacto_en" DESC);

-- Búsqueda por nombre y por teléfono: trigramas sin acentos, con el tenant DENTRO del
-- mismo índice gracias a btree_gin. `preferencias` NO está aquí, y es deliberado (R10):
-- un índice de trigramas sobre un campo que puede contener una alergia convierte el
-- buscador en una herramienta para minar datos de salud a base de preguntas.
CREATE INDEX "contactos_busqueda_trgm_idx" ON "contactos"
  USING gin ("tenant_id", public.inmutable_unaccent(lower(COALESCE("nombre", ''))) gin_trgm_ops);
CREATE INDEX "contactos_telefono_trgm_idx" ON "contactos"
  USING gin ("tenant_id", "telefono_e164" gin_trgm_ops);

CREATE INDEX "contactos_campos_personalizados_idx" ON "contactos" USING gin ("campos_personalizados");

-- Las tareas que vencen. PARCIAL: la bandeja de pendientes mira una fracción diminuta de
-- la tabla, y un índice completo crecería con todo el histórico cerrado.
CREATE INDEX "idx_oportunidades_tareas_pendientes"
  ON "oportunidades" ("tenant_id", "proxima_tarea_vence_en")
  WHERE "proxima_tarea_completada" = false AND "eliminado_en" IS NULL;

CREATE INDEX "oportunidades_tenant_id_paquete_id_idx" ON "oportunidades" ("tenant_id", "paquete_id");

-- -----------------------------------------------------------------------------
-- 10. RLS. Dirigida por datos: la función aplica ENABLE + FORCE + política con USING y
-- WITH CHECK. Se invoca explícitamente para las tablas nuevas, y después se reaplican los
-- privilegios declarados —que es el único mecanismo que los gobierna— para que el
-- `ALTER DEFAULT PRIVILEGES` que acaba de conceder permisos sobre estas tablas quede
-- reconciliado con `excepciones_rls`. Sin la segunda llamada, una tabla nueva nace con
-- permisos que nadie declaró.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('consentimientos_contacto');
SELECT aplicar_aislamiento_tenant('notas_internas');
SELECT aplicar_privilegios_declarados();

-- Cinturón: si algo de lo anterior hubiera dejado una tabla de negocio sin aislamiento,
-- esta migración no termina. Es la misma vista que mira la prueba de CI; comprobarla aquí
-- convierte el defecto en un fallo de despliegue en vez de en un hallazgo de auditoría.
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
