-- =============================================================================
-- Cotizaciones con versiones inmutables (tarea 6 de ESTADO.md)
--
-- ADR-0006: «Una cotización enviada es inmutable. Editarla crea una versión. Sin esto no se
-- puede resolver una disputa sobre qué se ofreció.» ADR-0009: «Una cotización congela sus
-- números»: cambiar la política de precio jamás altera una cotización ya enviada.
--
-- Dos tablas, y la división es la del invariante:
--
--   · `cotizaciones`          la CABECERA. Mutable: estado, título, qué versión vio el cliente.
--   · `versiones_cotizacion`  la INSTANTÁNEA. Inmutable desde el INSERT, y lo impone la base.
--
-- **La inmutabilidad es un disparador, no una convención del caso de uso.** Un caso de uso que
-- «no actualiza» protege contra el código que lo usa; no protege contra el siguiente caso de uso,
-- ni contra un `psql`, ni contra una migración de datos escrita con prisa. Una versión que se
-- puede editar no prueba qué se ofreció: prueba qué dice hoy la fila.
--
-- **Por qué las líneas van en JSONB dentro de la versión y no en una tabla hija.** Una tabla hija
-- de líneas necesita SU PROPIO disparador de inmutabilidad y, peor, una regla que impida añadirle
-- líneas a una versión ya cerrada —que no es un UPDATE ni un DELETE de nada, es un INSERT nuevo—.
-- Con las líneas dentro de la fila, la instantánea es UNA fila y un solo disparador la congela
-- entera. Lo que se pierde es consultar líneas con SQL relacional, que hoy nadie necesita; y lo
-- que sí importa del dinero —total, neto, margen— va en columnas `bigint` tipadas, con CHECK.
-- El alta valida la forma de las líneas y que sumen el total (§3).
--
-- Reversible: DROP de las dos tablas, el tipo, las dos funciones y las tres restricciones/índices
-- añadidos fuera. Ninguna tabla existente pierde filas ni columnas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tipos
--
-- El ciclo de vida de una cotización es invariante del dominio, no política de la agencia (R12):
-- ninguna agencia «no tiene» cotizaciones aceptadas. Por eso es enum y no tabla por tenant.
-- -----------------------------------------------------------------------------
CREATE TYPE "estado_cotizacion" AS ENUM ('BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'VENCIDA');

-- -----------------------------------------------------------------------------
-- 2. `cotizaciones` — la cabecera
-- -----------------------------------------------------------------------------

-- Destino de la foránea que obliga a que la oportunidad sea DEL MISMO contacto. Sin él, una
-- cotización podría colgar del contacto Ana y de la oportunidad de Beatriz, y el panel lateral
-- de cada una mostraría la cotización de la otra. `oportunidades` es pequeña: el índice se
-- construye en milisegundos y el bloqueo de escrituras que toma no se nota.
CREATE UNIQUE INDEX "oportunidades_id_contacto_id_tenant_id_key"
  ON "oportunidades" ("id", "contacto_id", "tenant_id");

CREATE TABLE "cotizaciones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contacto_id" UUID NOT NULL,
    "oportunidad_id" UUID,
    "titulo" VARCHAR(200) NOT NULL,
    "estado" "estado_cotizacion" NOT NULL DEFAULT 'BORRADOR',
    -- La versión que vio el cliente y cuándo se le envió. Las dos o ninguna (CHECK).
    "version_enviada" SMALLINT,
    "enviada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en" TIMESTAMPTZ(3),
    "creado_por" UUID,
    "actualizado_por" UUID,

    CONSTRAINT "cotizaciones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cotizaciones_id_tenant_id_key" ON "cotizaciones" ("id", "tenant_id");
-- El panel lateral de la bandeja: las cotizaciones de un contacto, la más reciente primero.
CREATE INDEX "cotizaciones_tenant_id_contacto_id_actualizado_en_idx"
  ON "cotizaciones" ("tenant_id", "contacto_id", "actualizado_en" DESC);
CREATE INDEX "cotizaciones_tenant_id_oportunidad_id_idx"
  ON "cotizaciones" ("tenant_id", "oportunidad_id");

ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_envio_completo"
  CHECK (("version_enviada" IS NULL) = ("enviada_en" IS NULL));

-- Enviada, aceptada, rechazada o vencida: todas presuponen que el cliente vio una versión.
-- Una cotización «aceptada» sin versión enviada es una aceptación de nada.
ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_estado_exige_envio"
  CHECK ("estado" = 'BORRADOR' OR "version_enviada" IS NOT NULL);

ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Todas COMPUESTAS con el tenant: la integridad referencial se evalúa por encima de RLS, y una
-- foránea simple deja colgar una cotización del contacto de otra agencia (aserción 48).
--
-- RESTRICT y no CASCADE hacia el contacto: los contactos se borran en blando, y una cotización
-- no debe desaparecer porque alguien borró a la persona. Es la prueba de lo que se ofreció.
ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Tres columnas: la oportunidad tiene que ser de ESTA agencia y de ESTE contacto. MATCH SIMPLE
-- (el de siempre) no comprueba nada cuando `oportunidad_id` es nulo, que es lo que se quiere.
ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_oportunidad_id_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("oportunidad_id", "contacto_id", "tenant_id")
  REFERENCES "oportunidades" ("id", "contacto_id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_actualizado_por_tenant_id_fkey"
  FOREIGN KEY ("actualizado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. `versiones_cotizacion` — la instantánea
--
-- Todo lo que hace falta para reconstruir qué se ofreció **sin mirar el catálogo**, porque el
-- catálogo cambia: el mayorista sube el neto, la agencia cambia su porcentaje, la vigencia se
-- borra al cargar la hoja de la temporada siguiente. Por eso `vigencia_id` y los `tarifaId` de
-- las líneas son copias SIN clave foránea: una foránea `RESTRICT` bloquearía el mantenimiento del
-- catálogo para siempre, y una `CASCADE` borraría la prueba. Un identificador suelto no filtra
-- nada entre agencias: lo que hay detrás está bajo RLS.
--
-- El paquete sí lleva foránea: se borra en blando, así que no estorba, y ata la versión a un
-- paquete de SU agencia.
--
-- Sin `actualizado_en` ni `actualizado_por`, y no es un descuido de R8 de la auditoría: una fila
-- que no se puede actualizar no tiene «última actualización». `creado_en` es el instante en que
-- se congeló.
-- -----------------------------------------------------------------------------
CREATE TABLE "versiones_cotizacion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "cotizacion_id" UUID NOT NULL,
    "numero" SMALLINT NOT NULL,

    -- Qué se cotizó, congelado.
    "paquete_id" UUID NOT NULL,
    "paquete_nombre" VARCHAR(200) NOT NULL,
    "destino" VARCHAR(120) NOT NULL,
    "noches" SMALLINT NOT NULL,
    "fecha_salida" DATE NOT NULL,
    "vigencia_id" UUID NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE NOT NULL,
    "de_salida_programada" BOOLEAN NOT NULL,

    -- Para quién.
    "adultos" SMALLINT NOT NULL,
    "ninos" SMALLINT NOT NULL,
    "infantes" SMALLINT NOT NULL,
    "acomodacion" "acomodacion",

    -- Con qué política se formó la venta. Copia de `politicas_de_precio` en ese instante.
    "politica_porcentaje" DECIMAL(6,3) NOT NULL,
    "politica_base" "base_del_margen" NOT NULL,
    "politica_origen" "origen_de_la_venta" NOT NULL,
    "politica_redondeo" INTEGER NOT NULL,

    -- Una por tipo de pasajero (y por suplemento aplicado), con la forma de `OpcionDePrecio`.
    "lineas" JSONB NOT NULL,

    -- R8: unidad mínima de la moneda, entero de 64 bits. Neto y margen nulos = desconocidos.
    "venta_unidades" BIGINT NOT NULL,
    "neto_unidades" BIGINT,
    "margen_unidades" BIGINT,
    "moneda_iso" CHAR(3) NOT NULL,

    -- Hasta cuándo se sostiene el precio ofrecido. `date`: la oferta vale «hasta el 30».
    "vigente_hasta" DATE,

    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por" UUID,

    CONSTRAINT "versiones_cotizacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "versiones_cotizacion_id_tenant_id_key"
  ON "versiones_cotizacion" ("id", "tenant_id");
-- Numeración por cotización. La sirve también: «la última versión» (recorrido hacia atrás) y el
-- destino de la foránea de `cotizaciones.version_enviada`. Dos altas simultáneas del mismo número
-- chocan aquí en vez de producir dos «versión 3».
CREATE UNIQUE INDEX "versiones_cotizacion_tenant_id_cotizacion_id_numero_key"
  ON "versiones_cotizacion" ("tenant_id", "cotizacion_id", "numero");
CREATE INDEX "versiones_cotizacion_tenant_id_paquete_id_idx"
  ON "versiones_cotizacion" ("tenant_id", "paquete_id");

ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_numero_positivo" CHECK ("numero" >= 1);
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_fechas_coherentes"
  CHECK ("vigencia_desde" <= "fecha_salida" AND "fecha_salida" <= "vigencia_hasta");
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_pasajeros_validos"
  CHECK ("adultos" >= 0 AND "ninos" >= 0 AND "infantes" >= 0
         AND "adultos" + "ninos" + "infantes" >= 1);
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_noches_validas" CHECK ("noches" >= 0);
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_politica_valida"
  CHECK ("politica_porcentaje" >= 0 AND "politica_redondeo" >= 0);
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_moneda_iso" CHECK ("moneda_iso" ~ '^[A-Z]{3}$');
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_lineas_no_vacias"
  CHECK (jsonb_typeof("lineas") = 'array' AND jsonb_array_length("lineas") >= 1);

-- El dinero cuadra o no entra.
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_venta_no_negativa" CHECK ("venta_unidades" >= 0);
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_neto_no_negativo"
  CHECK ("neto_unidades" IS NULL OR "neto_unidades" >= 0);
-- Margen desconocido sí y solo si neto desconocido; y si se conoce, es la resta. «Margen 0» con
-- neto nulo afirmaría que se vendió a costo, que es otra cosa (ADR-0009 §5).
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_margen_es_la_resta"
  CHECK (("neto_unidades" IS NULL AND "margen_unidades" IS NULL)
         OR "margen_unidades" = "venta_unidades" - "neto_unidades");

ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT hacia la cabecera, y NO CASCADE, aunque CASCADE pareciera lo natural. Una acción
-- referencial corre con el rol PROPIETARIO de la tabla que la sufre, no con el de quien borra: el
-- DELETE de versiones que dispararía un `DELETE FROM cotizaciones` de la API llegaría al disparador
-- de §4 como `current_user = propietario`, que es justo la mitad de la salida de purga. Con
-- RESTRICT no hay ninguna acción que herede ese rol: una cotización con versiones no se borra
-- físicamente —se borra en blando, `eliminado_en`—, y la purga borra primero las versiones.
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_cotizacion_id_tenant_id_fkey"
  FOREIGN KEY ("cotizacion_id", "tenant_id") REFERENCES "cotizaciones" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_paquete_id_tenant_id_fkey"
  FOREIGN KEY ("paquete_id", "tenant_id") REFERENCES "paquetes" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_creado_por_tenant_id_fkey"
  FOREIGN KEY ("creado_por", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- La versión enviada tiene que ser una versión DE ESTA cotización, de esta agencia. Una foránea
-- de tres columnas que reutiliza el `id` de la propia cabecera: no hay forma de apuntar a la
-- versión 2 de otra cotización.
--
-- DIFERIBLE, y es lo único diferible del esquema: cabecera y versiones se referencian en los dos
-- sentidos, así que la purga de una agencia —que borra las versiones antes que su cabecera— vería
-- una cabecera apuntando a una versión ya borrada durante una sentencia. Se comprueba al COMMIT,
-- cuando ya no hay ni una ni otra. Prisma no modela `DEFERRABLE`: el esquema dice `NoAction`.
ALTER TABLE "cotizaciones"
  ADD CONSTRAINT "cotizaciones_version_enviada_fkey"
  FOREIGN KEY ("tenant_id", "id", "version_enviada")
  REFERENCES "versiones_cotizacion" ("tenant_id", "cotizacion_id", "numero")
  ON DELETE NO ACTION ON UPDATE NO ACTION
  DEFERRABLE INITIALLY DEFERRED;

-- -----------------------------------------------------------------------------
-- 4. Los dos disparadores
--
-- Ni uno ni otro son SECURITY DEFINER: corren con el rol de quien escribe, bajo su RLS. Un
-- disparador no necesita EXECUTE para dispararse, así que se revoca a PUBLIC sin conceder a nadie
-- y la matriz rol × función de ADR-0008 no gana entradas.
-- -----------------------------------------------------------------------------

-- 4.1 El alta: las líneas tienen forma de dinero, en la moneda de la versión, y suman el total.
--
-- Es un disparador y no un CHECK porque un CHECK no admite subconsultas, y sumar un arreglo JSON
-- es una. «El número que el asesor escribe en WhatsApp es la suma de las líneas» (contrato
-- `CotizacionDeSalida.total`): si no cuadra, la versión miente sobre sí misma desde el primer día.
CREATE OR REPLACE FUNCTION versiones_cotizacion_validar_alta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  malas integer;
  suma  numeric;
BEGIN
  IF pg_catalog.jsonb_typeof(NEW.lineas) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'version de cotizacion: lineas debe ser un arreglo JSON'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) FILTER (WHERE NOT COALESCE(
           pg_catalog.jsonb_typeof(e -> 'total') = 'object'
           AND (e -> 'total' ->> 'unidades') ~ '^-?[0-9]{1,18}$'
           AND (e -> 'total' ->> 'moneda') = NEW.moneda_iso, false)),
         sum(CASE WHEN (e -> 'total' ->> 'unidades') ~ '^-?[0-9]{1,18}$'
                  THEN (e -> 'total' ->> 'unidades')::numeric END)
    INTO malas, suma
    FROM pg_catalog.jsonb_array_elements(NEW.lineas) AS e;

  IF malas > 0 THEN
    RAISE EXCEPTION 'version de cotizacion: % linea(s) sin total entero en %', malas, NEW.moneda_iso
      USING ERRCODE = 'check_violation';
  END IF;
  IF suma IS DISTINCT FROM NEW.venta_unidades::numeric THEN
    RAISE EXCEPTION 'version de cotizacion: las lineas suman % y la venta dice %', suma, NEW.venta_unidades
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 4.2 La inmutabilidad: ni UPDATE, ni DELETE, ni TRUNCATE.
--
-- **Una sola salida, y es la purga de la agencia entera.** Un tenant que se da de baja tiene que
-- poder desaparecer (Ley 1581: supresión), y sus cotizaciones con él. La salida exige las DOS
-- cosas a la vez:
--
--   (a) ser el PROPIETARIO de la tabla. Ningún rol de aplicación lo es ni puede llegar a serlo
--       (aserciones 14 y 21), así que la API no tiene esta salida aunque una inyección le deje
--       fijar cualquier variable de sesión. Ojo: una acción referencial en cascada SÍ corre como
--       propietario; por eso la única cascada que llega a esta tabla es la de `tenants`, que
--       ningún rol de aplicación puede borrar (ver la foránea a `cotizaciones`, §3); y
--   (b) haber declarado en ESTA transacción qué tenants se purgan:
--         SELECT set_config('viajapro.purga_de_tenants', '<uuid>,<uuid>', true);
--       Así ni el propietario borra una versión por accidente: un `DELETE` suelto, o un
--       `DELETE FROM tenants` sin declararlo, también se rechaza. Es lo que hace
--       `scripts/borrar-tenants.mjs`.
--
-- El UPDATE no tiene salida para nadie. Corregir una versión es crear la siguiente.
CREATE OR REPLACE FUNCTION versiones_cotizacion_inmutables()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_LEVEL = 'ROW'
     AND current_user = (SELECT pg_catalog.pg_get_userbyid(c.relowner)
                           FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)
     AND OLD.tenant_id::text = ANY (pg_catalog.string_to_array(
           pg_catalog.current_setting('viajapro.purga_de_tenants', true), ','))
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'version de cotizacion inmutable: % rechazado', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Una version enviada no se corrige: se crea la version siguiente.';
END;
$$;

REVOKE ALL ON FUNCTION versiones_cotizacion_validar_alta() FROM PUBLIC;
REVOKE ALL ON FUNCTION versiones_cotizacion_inmutables() FROM PUBLIC;

CREATE TRIGGER "versiones_cotizacion_validar_alta"
  BEFORE INSERT ON "versiones_cotizacion"
  FOR EACH ROW EXECUTE FUNCTION versiones_cotizacion_validar_alta();

CREATE TRIGGER "versiones_cotizacion_inmutables"
  BEFORE UPDATE OR DELETE ON "versiones_cotizacion"
  FOR EACH ROW EXECUTE FUNCTION versiones_cotizacion_inmutables();

CREATE TRIGGER "versiones_cotizacion_sin_truncate"
  BEFORE TRUNCATE ON "versiones_cotizacion"
  FOR EACH STATEMENT EXECUTE FUNCTION versiones_cotizacion_inmutables();

-- -----------------------------------------------------------------------------
-- 5. `mensajes.cotizacion_id` por fin apunta a algo (cola de ESTADO.md, dueño `datos`)
--
-- La columna existe desde el inbox sin foránea porque esta tabla no existía. La deuda era de
-- quien creara `cotizaciones`, en esta migración.
--
-- COMPUESTA con el tenant: un mensaje de una agencia no puede llevar la cotización de otra.
-- `SET NULL ("cotizacion_id")` y no SET NULL a secas: sobre una clave compuesta anularía también
-- `tenant_id`, que es NOT NULL (el defecto de 20261011090200, que no se repite).
--
-- NOT VALID y luego VALIDATE, como se prometió. Conviene decir lo que eso compra aquí y lo que no:
-- Prisma aplica el archivo en UNA transacción, así que el bloqueo de `ADD CONSTRAINT` se sostiene
-- hasta el final y la división no acorta la ventana. Hoy no importa —`mensajes` tiene unas pocas
-- filas y ninguna con `cotizacion_id`—; el día que una validación así caiga sobre millones de
-- filas, el VALIDATE va en una migración propia.
-- -----------------------------------------------------------------------------
ALTER TABLE "mensajes"
  ADD CONSTRAINT "mensajes_cotizacion_id_tenant_id_fkey"
  FOREIGN KEY ("cotizacion_id", "tenant_id") REFERENCES "cotizaciones" ("id", "tenant_id")
  ON DELETE SET NULL ("cotizacion_id") ON UPDATE RESTRICT
  NOT VALID;

ALTER TABLE "mensajes" VALIDATE CONSTRAINT "mensajes_cotizacion_id_tenant_id_fkey";

-- «Los mensajes que llevaron esta cotización», y la búsqueda que hace el motor en cada borrado de
-- una cotización. Parcial: casi ningún mensaje lleva cotización.
CREATE INDEX "mensajes_tenant_id_cotizacion_id_idx"
  ON "mensajes" ("tenant_id", "cotizacion_id") WHERE "cotizacion_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 6. RLS, dirigida por datos como el resto del esquema, y el cinturón
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('cotizaciones');
SELECT aplicar_aislamiento_tenant('versiones_cotizacion');
SELECT aplicar_privilegios_declarados();

DO $$
DECLARE
  defectos text;
  simples  text;
BEGIN
  SELECT string_agg(tabla || ': ' || problema, '; ')
    INTO defectos
    FROM tablas_sin_aislamiento
   WHERE problema IS NOT NULL;
  IF defectos IS NOT NULL THEN
    RAISE EXCEPTION 'Tablas sin aislamiento despues de esta migracion -> %', defectos;
  END IF;

  -- Ninguna foránea de las tablas nuevas, ni la de mensajes, sin `tenant_id` dentro (salvo las
  -- que apuntan a `tenants`, que SON el tenant).
  SELECT string_agg(c.conname, ', ')
    INTO simples
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
   WHERE c.contype = 'f'
     AND c.confrelid <> 'tenants'::regclass
     AND (t.relname IN ('cotizaciones', 'versiones_cotizacion')
          OR c.conname = 'mensajes_cotizacion_id_tenant_id_fkey')
     AND NOT EXISTS (
       SELECT 1
         FROM unnest(c.conkey) AS k
         JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'tenant_id'
     );
  IF simples IS NOT NULL THEN
    RAISE EXCEPTION 'Foraneas sin tenant_id en cotizaciones -> %', simples;
  END IF;
END;
$$;
