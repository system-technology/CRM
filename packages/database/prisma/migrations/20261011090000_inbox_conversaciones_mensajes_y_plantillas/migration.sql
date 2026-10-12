-- =============================================================================
-- Inbox — conversaciones, mensajes, adjuntos y el espejo de plantillas de Meta
--
-- Sirve packages/contracts/src/inbox.ts y packages/contracts/src/plantillas.ts.
--
-- Cuatro tablas de negocio nuevas, las cuatro con tenant_id, clave foránea compuesta
-- con el tenant y política RLS forzada con USING y WITH CHECK (R1, ADR-0003).
--
-- REVERSIBLE: sí. Las cuatro tablas son nuevas y los seis enums también; deshacerla es
-- DROP TABLE adjuntos, mensajes, plantillas_whatsapp, conversaciones + DROP TYPE, más
-- quitar notas_internas.conversacion_id. Lo único que no se recupera son los datos.
--
-- SEGURA EN CALIENTE: sí. Lo único que toca una tabla existente es
-- `ALTER TABLE notas_internas ADD COLUMN conversacion_id uuid` — anulable y sin valor
-- por defecto, que en PostgreSQL 11+ no reescribe la tabla y toma el ACCESS EXCLUSIVE
-- durante microsegundos. No hay ningún backfill.
--
-- -----------------------------------------------------------------------------
-- POR QUÉ `mensajes` NO ESTÁ PARTICIONADA (la pregunta del encargo)
--
-- El volumen es real: 500 conversaciones activas por agencia producen cientos de miles
-- de filas al año, y con cien agencias son decenas de millones. Aun así, hoy no se
-- particiona, y no por prudencia sino por tres razones concretas:
--
--   1. No ayuda a la consulta caliente. Abrir un hilo es
--      `WHERE tenant_id = ? AND conversacion_id = ? ORDER BY ocurrido_en DESC LIMIT 50`.
--      Eso lo resuelve un btree de tres o cuatro niveles, y un btree de tres niveles
--      cubre un millón de filas igual que cien millones. La partición no quita niveles:
--      los reparte. Particionar para acelerar una búsqueda por clave es trabajo que no
--      se cobra.
--
--   2. Particionar por `ocurrido_en` ROMPERÍA LA IDEMPOTENCIA DE R5, que es lo que esta
--      migración existe para garantizar. PostgreSQL exige que toda restricción única de
--      una tabla particionada CONTENGA la clave de partición. La unicidad pasaría de
--      `(tenant_id, wamid)` a `(tenant_id, wamid, ocurrido_en)` — y entonces el mismo
--      wamid reintentado por Meta con un timestamp distinto (o con el nuestro, si
--      alguna vez lo normalizamos) cae en otra partición y se inserta DOS VECES. La
--      defensa contra los reintentos de Meta se habría desactivado a cambio de una
--      optimización que el punto 1 dice que no hace falta. Es la clase de cambio que no
--      produce ningún error y se descubre con el mensaje duplicado en la pantalla de un
--      asesor.
--
--   3. Cuando haga falta, la forma correcta es OTRA: HASH por `tenant_id`. Mantiene
--      `(tenant_id, wamid)` exigible —la clave de partición está dentro—, acota el
--      vacuum y el coste de mantenimiento por agencia, y encaja con el aplicador de RLS,
--      que ya desciende por `pg_inherits` y pone política a cada partición.
--
-- Disparadores para revisarlo, y se escriben aquí para que no sean una intuición:
--   · la tabla pasa de ~50 M de filas, o
--   · el vacuum de `mensajes` deja de terminar dentro de la ventana de mantenimiento, o
--   · aparece una política de retención por fecha (borrar mensajes de más de N años),
--     que es el único caso donde partir por tiempo gana de verdad, y que entonces se
--     diseña con una tabla de deduplicación de wamid aparte, no particionada.
--
-- -----------------------------------------------------------------------------
-- R10 — EL TEXTO DE UN MENSAJE ES PII, Y AQUÍ SE DICE EN VOZ ALTA
--
-- `mensajes.texto` es la mayor superficie de datos sensibles del producto: ahí escribe
-- el viajero, y en una agencia de viajes eso incluye número de pasaporte, fecha de
-- nacimiento de un menor y a veces una condición de salud. NO se cifra por columna, y
-- la decisión tiene coste; estas son las dos caras:
--
--   · Por qué no se cifra: el hilo se lee entero en cada apertura de conversación y el
--     contrato `ConsultarBandeja.buscar` busca DENTRO del texto. Cifrado por columna
--     queda ilegible para cualquier índice y la búsqueda de la bandeja se vuelve un
--     recorrido completo descifrando fila a fila. Es el mismo razonamiento que ya se
--     aplicó a `contactos.preferencias`, multiplicado por el volumen.
--   · Qué se pone en su lugar, y es lo que hace la diferencia entre una decisión y una
--     omisión:
--       (a) RLS forzada: una agencia no puede leer una sola fila de otra.
--       (b) `texto` NO viaja NUNCA a `registros_auditoria.detalle` ni a `outbox.payload`.
--           Esas dos tablas se leen con otros criterios y copiar PII a ellas la saca del
--           control de retención.
--       (c) El índice de búsqueda es de TRIGRAMAS sobre el texto, dentro de la misma
--           tabla y bajo la misma política: no es una copia nueva fuera de RLS. Lo que
--           limita el minado no es el índice sino la API, que solo busca dentro del
--           tenant de la sesión.
--       (d) Cifrado en reposo del almacenamiento (Neon) y TLS en tránsito.
--
-- ESTO NO CIERRA EL ASUNTO. Si el cifrado por columna de `mensajes.texto` se considera
-- exigible para la Ley 1581, es un ADR con `auditor-seguridad` y un rediseño de la
-- búsqueda, no una columna que este agente cambie en silencio. Queda señalado aquí y en
-- ESTADO.md. Lo que esta migración sí resuelve es que el dato nazca aislado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enums
-- -----------------------------------------------------------------------------
CREATE TYPE "estado_conversacion" AS ENUM ('ABIERTA', 'EN_ESPERA', 'CERRADA');
CREATE TYPE "direccion_mensaje" AS ENUM ('ENTRANTE', 'SALIENTE');
CREATE TYPE "estado_mensaje" AS ENUM ('PENDIENTE', 'ENVIADO', 'ENTREGADO', 'LEIDO', 'REPRODUCIDO', 'FALLIDO');
CREATE TYPE "tipo_contenido" AS ENUM (
  'TEXTO', 'IMAGEN', 'DOCUMENTO', 'AUDIO', 'VIDEO', 'UBICACION',
  'CONTACTO', 'PLANTILLA', 'INTERACTIVO', 'REACCION', 'NO_SOPORTADO');
CREATE TYPE "categoria_plantilla" AS ENUM ('UTILIDAD', 'MARKETING', 'AUTENTICACION');
CREATE TYPE "estado_plantilla" AS ENUM ('APROBADA', 'PENDIENTE', 'RECHAZADA', 'PAUSADA', 'DESHABILITADA');

-- -----------------------------------------------------------------------------
-- 2. conversaciones
-- -----------------------------------------------------------------------------
CREATE TABLE "conversaciones" (
    "id"                        UUID NOT NULL,
    "tenant_id"                 UUID NOT NULL,
    "contacto_id"               UUID NOT NULL,
    "canal_id"                  UUID NOT NULL,
    "estado"                    "estado_conversacion" NOT NULL DEFAULT 'ABIERTA',
    "asignado_a_id"             UUID,
    "ultimo_mensaje_cliente_en" TIMESTAMPTZ(3),
    "ultimo_mensaje_texto"      VARCHAR(200),
    "ultimo_mensaje_en"         TIMESTAMPTZ(3),
    "ultimo_mensaje_direccion"  "direccion_mensaje",
    "mensajes_sin_leer"         SMALLINT NOT NULL DEFAULT 0,
    "sla_vence_en"              TIMESTAMPTZ(3),
    "primera_respuesta_en"      TIMESTAMPTZ(3),
    "etiquetas"                 TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "creado_en"                 TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"            TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en"              TIMESTAMPTZ(3),
    "creado_por"                UUID,
    "actualizado_por"           UUID,

    CONSTRAINT "conversaciones_pkey" PRIMARY KEY ("id")
);

-- Un contador negativo es un bug de la aplicación. Que se vea aquí y no en la interfaz.
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_sin_leer_no_negativo"
  CHECK ("mensajes_sin_leer" >= 0);

-- La vista previa y su instante van juntos o no van. Una fila con texto y sin fecha
-- ordena la bandeja por NULL y el hilo aparece abajo del todo sin que nadie sepa por qué.
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_ultimo_mensaje_completo"
  CHECK (
    ("ultimo_mensaje_en" IS NULL AND "ultimo_mensaje_direccion" IS NULL AND "ultimo_mensaje_texto" IS NULL)
    OR ("ultimo_mensaje_en" IS NOT NULL AND "ultimo_mensaje_direccion" IS NOT NULL)
  );

-- -----------------------------------------------------------------------------
-- 3. plantillas_whatsapp — el espejo
-- -----------------------------------------------------------------------------
CREATE TABLE "plantillas_whatsapp" (
    "id"                  UUID NOT NULL,
    "tenant_id"           UUID NOT NULL,
    "cuenta_id"           UUID NOT NULL,
    "meta_template_id"    VARCHAR(32),
    "nombre"              VARCHAR(512) NOT NULL,
    "idioma"              VARCHAR(10) NOT NULL,
    "categoria"           "categoria_plantilla" NOT NULL,
    "estado"              "estado_plantilla" NOT NULL DEFAULT 'PENDIENTE',
    "motivo_estado"       VARCHAR(500),
    "encabezado"          VARCHAR(60),
    "cuerpo"              VARCHAR(1024) NOT NULL,
    "pie"                 VARCHAR(60),
    "botones"             JSONB NOT NULL DEFAULT '[]',
    "variables"           JSONB NOT NULL DEFAULT '[]',
    "actualizada_en_meta" TIMESTAMPTZ(3) NOT NULL,
    "sincronizada_en"     TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado_cambiado_en"  TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"      TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en"        TIMESTAMPTZ(3),
    "creado_por"          UUID,
    "actualizado_por"     UUID,

    CONSTRAINT "plantillas_whatsapp_pkey" PRIMARY KEY ("id")
);

-- El mismo patrón que declara el contrato. Un nombre que Meta no admite no falla al
-- guardarlo: falla al ENVIAR, en producción, y nadie relaciona una cosa con la otra.
ALTER TABLE "plantillas_whatsapp" ADD CONSTRAINT "plantillas_nombre_formato_meta"
  CHECK ("nombre" ~ '^[a-z0-9_]+$');

-- Los límites del contrato, impuestos por el motor. Meta rechaza el registro por encima
-- de estos números; mejor descubrirlo aquí que en la cola de revisión de Meta.
ALTER TABLE "plantillas_whatsapp" ADD CONSTRAINT "plantillas_botones_son_lista"
  CHECK (jsonb_typeof("botones") = 'array' AND jsonb_array_length("botones") <= 10);
ALTER TABLE "plantillas_whatsapp" ADD CONSTRAINT "plantillas_variables_son_lista"
  CHECK (jsonb_typeof("variables") = 'array' AND jsonb_array_length("variables") <= 50);

-- Un estado que no se puede enviar sin explicación es una pantalla que no explica nada.
-- El asesor que busca la plantilla de ayer merece el motivo al lado, y el contrato lo
-- expone; aquí se exige que exista.
ALTER TABLE "plantillas_whatsapp" ADD CONSTRAINT "plantillas_estado_malo_exige_motivo"
  CHECK ("estado" NOT IN ('RECHAZADA', 'PAUSADA') OR "motivo_estado" IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 4. mensajes
-- -----------------------------------------------------------------------------
CREATE TABLE "mensajes" (
    "id"                 UUID NOT NULL,
    "tenant_id"          UUID NOT NULL,
    "conversacion_id"    UUID NOT NULL,
    "direccion"          "direccion_mensaje" NOT NULL,
    "tipo"               "tipo_contenido" NOT NULL,
    "estado"             "estado_mensaje" NOT NULL DEFAULT 'PENDIENTE',
    "texto"              TEXT,
    "wamid"              VARCHAR(128),
    "clave_idempotencia" UUID,
    "motivo_fallo"       VARCHAR(500),
    "codigo_error_meta"  INTEGER,
    "autor_id"           UUID,
    "plantilla_id"       UUID,
    "cotizacion_id"      UUID,
    "ocurrido_en"        TIMESTAMPTZ(3) NOT NULL,
    "creado_en"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en"     TIMESTAMPTZ(3) NOT NULL,
    "eliminado_en"       TIMESTAMPTZ(3),

    CONSTRAINT "mensajes_pkey" PRIMARY KEY ("id")
);

-- Un mensaje ENTRANTE con autor es un mensaje puesto en boca del viajero. No existe.
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_entrante_sin_autor"
  CHECK ("direccion" = 'SALIENTE' OR "autor_id" IS NULL);

-- Un ENTRANTE siempre trae wamid: lo pone Meta en el webhook. Un SALIENTE no lo tiene
-- hasta que Meta responde, y por eso ahí sí es anulable. Sin este CHECK, un entrante
-- insertado sin wamid se duplica en el siguiente reintento sin que nada lo impida: el
-- índice único no sirve de nada sobre un NULL.
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_entrante_exige_wamid"
  CHECK ("direccion" = 'SALIENTE' OR "wamid" IS NOT NULL);

-- El motivo y el código solo tienen sentido en un fallo. Un mensaje ENTREGADO con
-- motivo de fallo es una contradicción que la bandeja pintaría como error.
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_fallo_explica_solo_el_fallo"
  CHECK ("estado" = 'FALLIDO' OR ("motivo_fallo" IS NULL AND "codigo_error_meta" IS NULL));

-- Si es de tipo PLANTILLA, hay que saber cuál: si no, no se puede auditar el gasto ni
-- explicar al asesor qué se envió. Y al revés: una plantilla apuntada desde un mensaje
-- que no es de ese tipo es ruido.
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_plantilla_coherente"
  CHECK (("tipo" = 'PLANTILLA') = ("plantilla_id" IS NOT NULL));

-- -----------------------------------------------------------------------------
-- 5. adjuntos
-- -----------------------------------------------------------------------------
CREATE TABLE "adjuntos" (
    "id"             UUID NOT NULL,
    "tenant_id"      UUID NOT NULL,
    "mensaje_id"     UUID NOT NULL,
    "tipo"           "tipo_contenido" NOT NULL,
    "media_id_meta"  VARCHAR(64),
    "clave_objeto"   VARCHAR(500),
    "nombre_archivo" VARCHAR(255),
    "tamano_bytes"   BIGINT,
    "mime_type"      VARCHAR(100),
    "descargado_en"  TIMESTAMPTZ(3),
    "creado_en"      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eliminado_en"   TIMESTAMPTZ(3),

    CONSTRAINT "adjuntos_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_tamano_no_negativo"
  CHECK ("tamano_bytes" IS NULL OR "tamano_bytes" >= 0);

-- Descargado quiere decir que está en NUESTRO almacén. Sin clave de objeto no lo está,
-- y la API estaría emitiendo una URL firmada que apunta a la nada.
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_descargado_tiene_objeto"
  CHECK ("descargado_en" IS NULL OR "clave_objeto" IS NOT NULL);

-- -----------------------------------------------------------------------------
-- 6. notas_internas gana un ancla OPCIONAL a la conversación
--
-- `ConversacionDetalle.notas` se sirve de aquí. La nota sigue siendo del CONTACTO —es lo
-- que el asesor quiere recordar de la persona, no del hilo—; esta columna solo dice
-- desde dónde se escribió, para que el hilo pueda mostrar las suyas.
--
-- Anulable y sin DEFAULT: no reescribe ninguna fila existente. Seguro en caliente.
-- -----------------------------------------------------------------------------
ALTER TABLE "notas_internas" ADD COLUMN "conversacion_id" UUID;

-- -----------------------------------------------------------------------------
-- 7. Unicidades
-- -----------------------------------------------------------------------------

-- UN hilo por contacto y canal. Es lo que permite al webhook hacer ON CONFLICT DO UPDATE
-- sin carreras: dos mensajes del mismo viajero procesados a la vez no crean dos hilos.
CREATE UNIQUE INDEX "conversaciones_tenant_id_canal_id_contacto_id_key"
  ON "conversaciones" ("tenant_id", "canal_id", "contacto_id");
-- Sostiene las claves foráneas compuestas de mensajes y notas_internas.
CREATE UNIQUE INDEX "conversaciones_id_tenant_id_key" ON "conversaciones" ("id", "tenant_id");

CREATE UNIQUE INDEX "mensajes_id_tenant_id_key" ON "mensajes" ("id", "tenant_id");
CREATE UNIQUE INDEX "adjuntos_id_tenant_id_key" ON "adjuntos" ("id", "tenant_id");

-- LA IDEMPOTENCIA DE R5, EN LA BASE Y NO EN EL CÓDIGO.
--
-- Meta reintenta un webhook hasta recibir 200, y también cuando el 200 se perdió de
-- vuelta. Sin esto, cada reintento duplica el mensaje en la pantalla del asesor.
--
-- PARCIAL (`WHERE wamid IS NOT NULL`): los salientes no tienen wamid hasta que Meta
-- responde, y en un índice único normal los NULL no chocan — pero el índice parcial
-- además no los indexa, que con cientos de miles de filas es espacio que no se paga.
--
-- POR TENANT y no global, por la misma razón que `canales.phone_number_id`: una
-- unicidad global sería un oráculo que confirma a una agencia la actividad de otra.
CREATE UNIQUE INDEX "mensajes_tenant_id_wamid_key"
  ON "mensajes" ("tenant_id", "wamid") WHERE "wamid" IS NOT NULL;

-- La otra mitad de R5: entre el clic del asesor y la respuesta de Meta no hay ningún
-- identificador, así que un doble clic mandaría el mensaje dos veces — y una plantilla
-- se COBRA dos veces.
CREATE UNIQUE INDEX "mensajes_tenant_id_clave_idempotencia_key"
  ON "mensajes" ("tenant_id", "clave_idempotencia") WHERE "clave_idempotencia" IS NOT NULL;

-- La identidad de Meta: (WABA, nombre, idioma). NO (tenant, nombre): una agencia con dos
-- WABAs puede tener la misma plantilla registrada en los dos, con estados distintos.
CREATE UNIQUE INDEX "plantillas_whatsapp_tenant_id_cuenta_id_nombre_idioma_key"
  ON "plantillas_whatsapp" ("tenant_id", "cuenta_id", "nombre", "idioma");
CREATE UNIQUE INDEX "plantillas_whatsapp_id_tenant_id_key"
  ON "plantillas_whatsapp" ("id", "tenant_id");
-- El identificador de Meta, cuando lo conocemos. Por tenant, parcial, mismo criterio.
CREATE UNIQUE INDEX "plantillas_whatsapp_tenant_id_meta_template_id_key"
  ON "plantillas_whatsapp" ("tenant_id", "meta_template_id") WHERE "meta_template_id" IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 8. Claves foráneas — TODAS compuestas con el tenant
--
-- Es el agujero que se cerró en `oportunidades` y es el mismo aquí: RLS NO interviene en
-- la integridad referencial. PostgreSQL comprueba las claves foráneas por encima de las
-- políticas, de modo que con una clave simple el hilo de una agencia puede colgar del
-- contacto de otra, y la fila resultante es invisible para las dos.
-- -----------------------------------------------------------------------------
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_contacto_id_tenant_id_fkey"
  FOREIGN KEY ("contacto_id", "tenant_id") REFERENCES "contactos" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_canal_id_tenant_id_fkey"
  FOREIGN KEY ("canal_id", "tenant_id") REFERENCES "canales" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_asignado_a_id_tenant_id_fkey"
  FOREIGN KEY ("asignado_a_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "plantillas_whatsapp" ADD CONSTRAINT "plantillas_whatsapp_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "plantillas_whatsapp" ADD CONSTRAINT "plantillas_whatsapp_cuenta_id_tenant_id_fkey"
  FOREIGN KEY ("cuenta_id", "tenant_id") REFERENCES "cuentas_whatsapp" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_conversacion_id_tenant_id_fkey"
  FOREIGN KEY ("conversacion_id", "tenant_id") REFERENCES "conversaciones" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_autor_id_tenant_id_fkey"
  FOREIGN KEY ("autor_id", "tenant_id") REFERENCES "usuarios" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_plantilla_id_tenant_id_fkey"
  FOREIGN KEY ("plantilla_id", "tenant_id") REFERENCES "plantillas_whatsapp" ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_mensaje_id_tenant_id_fkey"
  FOREIGN KEY ("mensaje_id", "tenant_id") REFERENCES "mensajes" ("id", "tenant_id")
  ON DELETE CASCADE ON UPDATE RESTRICT;

ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_conversacion_id_tenant_id_fkey"
  FOREIGN KEY ("conversacion_id", "tenant_id") REFERENCES "conversaciones" ("id", "tenant_id")
  ON DELETE SET NULL ON UPDATE RESTRICT;

-- `cotizacion_id` SIN clave foránea, a propósito: la tabla `cotizaciones` todavía no
-- existe. La columna se crea hoy porque el contrato ya la expone y porque añadir una
-- columna a `mensajes` dentro de dos años, con millones de filas, es caro. La clave
-- compuesta entra con la migración que cree `cotizaciones`:
--   ALTER TABLE mensajes ADD CONSTRAINT ... FOREIGN KEY (cotizacion_id, tenant_id) ...
--     NOT VALID;  -- no bloquea
--   ALTER TABLE mensajes VALIDATE CONSTRAINT ...;  -- recorre sin ACCESS EXCLUSIVE
COMMENT ON COLUMN "mensajes"."cotizacion_id" IS
  'La cotizacion que iba en este mensaje. Sin FK hasta que exista la tabla cotizaciones; se anade con ADD CONSTRAINT NOT VALID + VALIDATE.';

COMMENT ON COLUMN "mensajes"."texto" IS
  'PII de viajeros (R10): pasaporte, fecha de nacimiento. No va a registros_auditoria.detalle ni a outbox.payload.';

COMMENT ON TABLE "plantillas_whatsapp" IS
  'Espejo local de las plantillas de Meta. Meta las aprueba, las rechaza y las PAUSA sola: el estado cambia sin que nadie escriba aqui.';

-- -----------------------------------------------------------------------------
-- 9. Índices de las rutas calientes. El tenant va SIEMPRE primero.
-- -----------------------------------------------------------------------------

-- La bandeja: por estado y por actividad.
CREATE INDEX "conversaciones_tenant_id_estado_ultimo_mensaje_en_idx"
  ON "conversaciones" ("tenant_id", "estado", "ultimo_mensaje_en" DESC);
-- El filtro MIAS y el SIN_ASIGNAR.
CREATE INDEX "conversaciones_tenant_id_asignado_a_id_ultimo_mensaje_en_idx"
  ON "conversaciones" ("tenant_id", "asignado_a_id", "ultimo_mensaje_en" DESC);
CREATE INDEX "conversaciones_tenant_id_contacto_id_idx"
  ON "conversaciones" ("tenant_id", "contacto_id");

-- La ventana de servicio. PARCIAL: la bandeja solo mira hilos vivos, y el histórico
-- cerrado no tiene ventana que calcular.
CREATE INDEX "idx_conversaciones_ventana"
  ON "conversaciones" ("tenant_id", "ultimo_mensaje_cliente_en" DESC)
  WHERE "eliminado_en" IS NULL AND "estado" <> 'CERRADA';

-- El filtro SLA_VENCIDO. PARCIAL: solo las que aún no han tenido primera respuesta, que
-- es una fracción diminuta. Un índice completo crecería con todo el histórico atendido.
CREATE INDEX "idx_conversaciones_sla_pendiente"
  ON "conversaciones" ("tenant_id", "sla_vence_en")
  WHERE "primera_respuesta_en" IS NULL AND "eliminado_en" IS NULL;

-- Las etiquetas del contrato, filtrables sin recorrer. btree_gin mete el tenant dentro
-- del mismo índice, igual que en la búsqueda de contactos.
CREATE INDEX "conversaciones_etiquetas_idx"
  ON "conversaciones" USING gin ("tenant_id", "etiquetas");

-- LA CONSULTA CALIENTE DEL PRODUCTO: abrir un hilo.
--
-- `ocurrido_en` es el instante de META y tiene resolución de SEGUNDOS: dos mensajes del
-- mismo segundo saldrían en orden distinto en cada consulta. El desempate es `id`, que es
-- UUID v7 y por tanto ordenable en el tiempo. El mismo orden sirve para paginar hacia
-- atrás con un cursor `(ocurrido_en, id)`, que es estable aunque lleguen mensajes nuevos.
CREATE INDEX "mensajes_hilo_idx"
  ON "mensajes" ("tenant_id", "conversacion_id", "ocurrido_en" DESC, "id" DESC);

-- Los que están en vuelo: el reconciliador de estados busca aquí. PARCIAL y diminuto.
CREATE INDEX "idx_mensajes_en_vuelo"
  ON "mensajes" ("tenant_id", "creado_en")
  WHERE "estado" IN ('PENDIENTE', 'ENVIADO');

-- La búsqueda de la bandeja dentro del texto (`ConsultarBandeja.buscar`). Trigramas sin
-- acentos, con el tenant DENTRO del índice. Sin esto es `LIKE '%texto%'` sobre cientos de
-- miles de filas, que es un recorrido completo por pulsación de tecla.
-- Ver la nota de R10 de la cabecera: el índice vive en la misma tabla y bajo la misma
-- política; lo que limita el minado es que la API solo busca dentro del tenant de sesión.
CREATE INDEX "mensajes_texto_trgm_idx" ON "mensajes"
  USING gin ("tenant_id", public.inmutable_unaccent(lower(COALESCE("texto", ''))) gin_trgm_ops);

-- La tarjeta de propuesta: «qué mensajes llevaban esta cotización». PARCIAL.
CREATE INDEX "idx_mensajes_cotizacion"
  ON "mensajes" ("tenant_id", "cotizacion_id") WHERE "cotizacion_id" IS NOT NULL;

CREATE INDEX "adjuntos_tenant_id_mensaje_id_idx" ON "adjuntos" ("tenant_id", "mensaje_id");
-- La cola de descargas: lo que aún no está en nuestro almacén. PARCIAL.
CREATE INDEX "idx_adjuntos_pendientes_descarga"
  ON "adjuntos" ("tenant_id", "creado_en") WHERE "descargado_en" IS NULL;

-- El selector de plantillas de la bandeja.
CREATE INDEX "plantillas_whatsapp_tenant_id_cuenta_id_estado_idx"
  ON "plantillas_whatsapp" ("tenant_id", "cuenta_id", "estado");

CREATE INDEX "notas_internas_tenant_id_conversacion_id_escrita_en_idx"
  ON "notas_internas" ("tenant_id", "conversacion_id", "escrita_en" DESC);

-- -----------------------------------------------------------------------------
-- 10. RLS. Mismo mecanismo dirigido por datos que el resto del esquema.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('conversaciones');
SELECT aplicar_aislamiento_tenant('plantillas_whatsapp');
SELECT aplicar_aislamiento_tenant('mensajes');
SELECT aplicar_aislamiento_tenant('adjuntos');
SELECT aplicar_privilegios_declarados();

-- Cinturón: si algo de lo anterior hubiera dejado una tabla de negocio sin aislamiento,
-- esta migración no termina. Es la misma vista que mira la prueba de CI.
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
