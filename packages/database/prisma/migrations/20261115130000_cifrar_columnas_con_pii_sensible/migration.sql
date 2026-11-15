-- =============================================================================
-- ADR-0015 — Cifrado de las columnas con PII sensible de viajeros (opción A). T-212.
--
-- Las cinco columnas que la tabla de alcance del ADR marca «Cifrar» dejan de existir en claro.
-- Cada una pasa a CUATRO columnas, el mismo patrón que `cuentas_whatsapp.token_*` y
-- `recepciones_webhook.payload_*`:
--
--   <col>_cifrado        BYTEA     el criptograma AES-256-GCM (sin nonce ni etiqueta)
--   <col>_nonce          BYTEA     12 bytes aleatorios por cifrado (concreción 2)
--   <col>_tag            BYTEA     16 bytes de la etiqueta GCM
--   <col>_clave_version  SMALLINT  la v<n> de CAMPOS_SENSIBLES_KEY con la que se cifró (>= 1)
--
--   mensajes.texto                         -> texto_*                (anulable)
--   conversaciones.ultimo_mensaje_texto    -> ultimo_mensaje_texto_* (anulable)
--   contactos.preferencias                 -> preferencias_*         (anulable)
--   notas_internas.texto                   -> texto_*                (NOT NULL: una nota sin texto no es nota)
--   adjuntos.nombre_archivo                -> nombre_archivo_*       (anulable)
--
-- Las cuatro van juntas o no van (`num_nonnulls(...) IN (0, 4)`): un BYTEA suelto no se
-- distingue de un BYTEA con el texto en claro, y un criptograma sin versión no se puede rotar.
-- La clave, el AAD y el tope de longitud del claro los pone la aplicación (concreciones 1–3);
-- aquí queda un tope de bytes del criptograma (GCM no expande: bytes = bytes UTF-8 del claro,
-- como mucho 4 por carácter) para que un error de la aplicación no meta un documento entero en
-- una vista previa. `mensajes.texto` no tiene tope: el contrato admite 4.096 caracteres al
-- enviar y Meta hasta 4.096 al recibir, y el TEXT original tampoco lo tenía.
--
-- Además, la exigencia del ADR sobre `adjuntos.clave_objeto`: identificador OPACO
-- `<tenant_id>/<uuid>`, nunca derivado de `nombre_archivo` (CHECK `adjuntos_clave_objeto_opaca`).
--
-- -----------------------------------------------------------------------------
-- LAS FILAS EXISTENTES — el plan que fija el ADR («Por qué ahora»)
-- -----------------------------------------------------------------------------
-- No hay datos de producción: local, CI y la rama de desarrollo de Neon son semillas y
-- fixtures. **No hay paso de claro a cifrado**, y no puede haberlo en SQL: la clave vive solo en
-- la API y el trabajador, nunca en la base. Las columnas en claro se ELIMINAN, con lo que el
-- texto deja de existir en el mismo instante en que aparecen las cifradas; las semillas se
-- vuelven a sembrar cifradas (`pnpm db:seed` ya no escribe estas columnas).
--
--   - mensajes, conversaciones, contactos y adjuntos: la fila sigue; su texto queda NULO en las
--     cuatro columnas (num_nonnulls = 0), que es un estado legal. La bandeja muestra el hilo sin
--     texto en las filas viejas, no un error.
--   - notas_internas: una nota sin texto no es representable, así que las notas existentes se
--     BORRAN antes de añadir las columnas NOT NULL. Borrado FÍSICO a propósito y solo aquí.
--   - adjuntos.clave_objeto: las claves que no cumplen `<tenant_id>/<uuid>` se anulan (y su
--     `descargado_en`, que sin clave no es verdad) antes de imponer el CHECK. Hoy ningún código
--     la escribe.
--
-- El DELETE y el UPDATE corren AGENCIA POR AGENCIA con `app.current_tenant`: las tablas tienen
-- RLS FORZADA y, con un rol de migraciones sin BYPASSRLS, una sentencia sin contexto vería cero
-- filas y terminaría en verde sin hacer nada (mismo motivo que 20261104150000). Si aun así
-- quedara una nota, el `ADD COLUMN ... NOT NULL` siguiente revienta, y si quedara una clave no
-- opaca, el CHECK revienta: la migración no puede terminar a medias.
--
-- **NO ES REVERSIBLE en el contenido**, y se declara: el texto en claro se destruye. Revertir el
-- ESQUEMA es una migración nueva que recree las columnas en claro y descifre por lotes desde la
-- aplicación (ADR-0015, «Qué habría que cambiar para revertir esto»). El contenido de desarrollo
-- que se pierde aquí se recupera volviendo a sembrar, no desde la base.
--
-- -----------------------------------------------------------------------------
-- SEGURA EN CALIENTE (con lo que hay hoy)
-- -----------------------------------------------------------------------------
-- DROP COLUMN y ADD COLUMN anulable sin DEFAULT solo tocan el catálogo. Los CHECK se añaden
-- NOT VALID y se validan aparte (SHARE UPDATE EXCLUSIVE); sobre columnas recién creadas y nulas
-- la validación no puede fallar. El NOT NULL de notas_internas cae sobre una tabla vacía.
-- `DROP INDEX` (no CONCURRENTLY: la migración corre en una transacción) toma ACCESS EXCLUSIVE
-- sobre `mensajes` lo que tarda en borrar el fichero del índice. **El despliegue NO es de dos
-- fases**: el código anterior lee `mensajes.texto` y falla en cuanto esta migración se aplica,
-- así que API, trabajador y migración salen juntos. Es aceptable porque no hay servicio
-- desplegado con tráfico (CLAUDE.md §1); con datos reales haría falta el camino largo
-- (añadir cifradas → doble escritura → recifrar por lotes desde la aplicación → retirar).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Las filas que no sobreviven, agencia por agencia (ver la cabecera)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t record;
  quedan integer;
BEGIN
  FOR t IN SELECT id FROM "tenants" ORDER BY id LOOP
    PERFORM set_config('app.current_tenant', t.id::text, true);

    DELETE FROM "notas_internas" WHERE "tenant_id" = t.id;
    SELECT count(*) INTO quedan FROM "notas_internas" WHERE "tenant_id" = t.id;
    IF quedan > 0 THEN
      RAISE EXCEPTION 'La agencia % conserva % nota(s) en claro.', t.id, quedan;
    END IF;

    UPDATE "adjuntos"
       SET "clave_objeto" = NULL,
           "descargado_en" = NULL
     WHERE "tenant_id" = t.id
       AND "clave_objeto" IS NOT NULL
       AND NOT (
         "clave_objeto" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         AND split_part("clave_objeto", '/', 1) = "tenant_id"::text
       );
  END LOOP;

  -- El contexto no sobrevive a la migración: un valor colgado haría que lo que corra después en
  -- esta transacción viera las filas de la última agencia del bucle.
  PERFORM set_config('app.current_tenant', '', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. mensajes.texto — y el índice trigram, que ya no tiene sobre qué buscar
-- -----------------------------------------------------------------------------
-- Concreción 5: `ConsultarBandeja.buscar` pasa a buscar por el nombre y el teléfono del
-- contacto. El índice se borra ANTES que la columna para que su desaparición conste aquí con
-- nombre y no como efecto colateral del DROP COLUMN.
DROP INDEX IF EXISTS "mensajes_texto_trgm_idx";

ALTER TABLE "mensajes" DROP COLUMN "texto";

ALTER TABLE "mensajes"
  ADD COLUMN "texto_cifrado"       BYTEA,
  ADD COLUMN "texto_nonce"         BYTEA,
  ADD COLUMN "texto_tag"           BYTEA,
  ADD COLUMN "texto_clave_version" SMALLINT;

ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_texto_cifrado_completo"
  CHECK (num_nonnulls("texto_cifrado", "texto_nonce", "texto_tag", "texto_clave_version") IN (0, 4))
  NOT VALID;
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_texto_formato"
  CHECK (
    ("texto_nonce" IS NULL OR octet_length("texto_nonce") = 12)
    AND ("texto_tag" IS NULL OR octet_length("texto_tag") = 16)
    AND ("texto_clave_version" IS NULL OR "texto_clave_version" >= 1)
  ) NOT VALID;

COMMENT ON COLUMN "mensajes"."texto_cifrado" IS
  'ADR-0015. Texto del mensaje cifrado con AES-256-GCM por la API o el trabajador; clave HKDF por agencia y columna, AAD con el id del mensaje. Nunca en claro. Va con texto_nonce, texto_tag y texto_clave_version, o no va.';

-- -----------------------------------------------------------------------------
-- 2. conversaciones.ultimo_mensaje_texto
-- -----------------------------------------------------------------------------
-- El CHECK de la vista previa nombra la columna vieja y DROP COLUMN lo borraría en silencio.
-- Se borra a la vista y se rehace con la columna nueva.
ALTER TABLE "conversaciones" DROP CONSTRAINT "conversaciones_ultimo_mensaje_completo";

ALTER TABLE "conversaciones" DROP COLUMN "ultimo_mensaje_texto";

ALTER TABLE "conversaciones"
  ADD COLUMN "ultimo_mensaje_texto_cifrado"       BYTEA,
  ADD COLUMN "ultimo_mensaje_texto_nonce"         BYTEA,
  ADD COLUMN "ultimo_mensaje_texto_tag"           BYTEA,
  ADD COLUMN "ultimo_mensaje_texto_clave_version" SMALLINT;

ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_ultimo_mensaje_texto_cifrado_completo"
  CHECK (num_nonnulls(
    "ultimo_mensaje_texto_cifrado", "ultimo_mensaje_texto_nonce",
    "ultimo_mensaje_texto_tag", "ultimo_mensaje_texto_clave_version"
  ) IN (0, 4)) NOT VALID;
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_ultimo_mensaje_texto_formato"
  CHECK (
    ("ultimo_mensaje_texto_nonce" IS NULL OR octet_length("ultimo_mensaje_texto_nonce") = 12)
    AND ("ultimo_mensaje_texto_tag" IS NULL OR octet_length("ultimo_mensaje_texto_tag") = 16)
    AND ("ultimo_mensaje_texto_clave_version" IS NULL OR "ultimo_mensaje_texto_clave_version" >= 1)
    -- 200 caracteres del contrato, a 4 bytes como mucho cada uno.
    AND ("ultimo_mensaje_texto_cifrado" IS NULL OR octet_length("ultimo_mensaje_texto_cifrado") <= 800)
  ) NOT VALID;

-- La misma regla de antes: la vista previa y su instante van juntos o no van.
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_ultimo_mensaje_completo"
  CHECK (
    ("ultimo_mensaje_en" IS NULL AND "ultimo_mensaje_direccion" IS NULL AND "ultimo_mensaje_texto_cifrado" IS NULL)
    OR ("ultimo_mensaje_en" IS NOT NULL AND "ultimo_mensaje_direccion" IS NOT NULL)
  ) NOT VALID;

COMMENT ON COLUMN "conversaciones"."ultimo_mensaje_texto_cifrado" IS
  'ADR-0015. Vista previa (200 caracteres, recortada por la API ANTES de cifrar) con AES-256-GCM. AAD con el id de la conversacion.';

-- -----------------------------------------------------------------------------
-- 3. contactos.preferencias — dato de salud (alergias)
-- -----------------------------------------------------------------------------
ALTER TABLE "contactos" DROP COLUMN "preferencias";

ALTER TABLE "contactos"
  ADD COLUMN "preferencias_cifrado"       BYTEA,
  ADD COLUMN "preferencias_nonce"         BYTEA,
  ADD COLUMN "preferencias_tag"           BYTEA,
  ADD COLUMN "preferencias_clave_version" SMALLINT;

ALTER TABLE "contactos" ADD CONSTRAINT "contactos_preferencias_cifrado_completo"
  CHECK (num_nonnulls(
    "preferencias_cifrado", "preferencias_nonce", "preferencias_tag", "preferencias_clave_version"
  ) IN (0, 4)) NOT VALID;
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_preferencias_formato"
  CHECK (
    ("preferencias_nonce" IS NULL OR octet_length("preferencias_nonce") = 12)
    AND ("preferencias_tag" IS NULL OR octet_length("preferencias_tag") = 16)
    AND ("preferencias_clave_version" IS NULL OR "preferencias_clave_version" >= 1)
    -- 2.000 caracteres del contrato, a 4 bytes como mucho cada uno.
    AND ("preferencias_cifrado" IS NULL OR octet_length("preferencias_cifrado") <= 8000)
  ) NOT VALID;

COMMENT ON COLUMN "contactos"."preferencias_cifrado" IS
  'ADR-0015. Preferencias del contacto (alergias: dato de salud, Ley 1581) cifradas con AES-256-GCM. AAD con el id del contacto. Toda lectura queda en registros_auditoria.';

-- -----------------------------------------------------------------------------
-- 4. notas_internas.texto — obligatorio (la tabla quedó vacía en el paso 0)
-- -----------------------------------------------------------------------------
ALTER TABLE "notas_internas" DROP COLUMN "texto";

ALTER TABLE "notas_internas"
  ADD COLUMN "texto_cifrado"       BYTEA    NOT NULL,
  ADD COLUMN "texto_nonce"         BYTEA    NOT NULL,
  ADD COLUMN "texto_tag"           BYTEA    NOT NULL,
  ADD COLUMN "texto_clave_version" SMALLINT NOT NULL;

ALTER TABLE "notas_internas" ADD CONSTRAINT "notas_internas_texto_formato"
  CHECK (
    octet_length("texto_nonce") = 12
    AND octet_length("texto_tag") = 16
    AND "texto_clave_version" >= 1
    -- 2.000 caracteres del contrato, a 4 bytes como mucho cada uno.
    AND octet_length("texto_cifrado") BETWEEN 1 AND 8000
  ) NOT VALID;

COMMENT ON COLUMN "notas_internas"."texto_cifrado" IS
  'ADR-0015. Lo que el asesor anota del viajero, cifrado con AES-256-GCM. AAD con el id de la nota. Obligatorio: una nota sin texto no es representable.';

-- -----------------------------------------------------------------------------
-- 5. adjuntos.nombre_archivo — y la clave del objeto, opaca
-- -----------------------------------------------------------------------------
ALTER TABLE "adjuntos" DROP COLUMN "nombre_archivo";

ALTER TABLE "adjuntos"
  ADD COLUMN "nombre_archivo_cifrado"       BYTEA,
  ADD COLUMN "nombre_archivo_nonce"         BYTEA,
  ADD COLUMN "nombre_archivo_tag"           BYTEA,
  ADD COLUMN "nombre_archivo_clave_version" SMALLINT;

ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_nombre_archivo_cifrado_completo"
  CHECK (num_nonnulls(
    "nombre_archivo_cifrado", "nombre_archivo_nonce", "nombre_archivo_tag", "nombre_archivo_clave_version"
  ) IN (0, 4)) NOT VALID;
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_nombre_archivo_formato"
  CHECK (
    ("nombre_archivo_nonce" IS NULL OR octet_length("nombre_archivo_nonce") = 12)
    AND ("nombre_archivo_tag" IS NULL OR octet_length("nombre_archivo_tag") = 16)
    AND ("nombre_archivo_clave_version" IS NULL OR "nombre_archivo_clave_version" >= 1)
    -- 255 caracteres, a 4 bytes como mucho cada uno.
    AND ("nombre_archivo_cifrado" IS NULL OR octet_length("nombre_archivo_cifrado") <= 1020)
  ) NOT VALID;

COMMENT ON COLUMN "adjuntos"."nombre_archivo_cifrado" IS
  'ADR-0015. Nombre que eligio el viajero («pasaporte_AB123456.jpg»), cifrado con AES-256-GCM. AAD con el id del adjunto.';

-- La base puede imponer la exigencia entera: el prefijo es EXACTAMENTE el tenant de la fila (S3
-- no tiene RLS; ADR-0003) y lo que sigue es un UUID en minúsculas, sin extensión ni carpetas.
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_clave_objeto_opaca"
  CHECK (
    "clave_objeto" IS NULL
    OR (
      "clave_objeto" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part("clave_objeto", '/', 1) = "tenant_id"::text
    )
  ) NOT VALID;

COMMENT ON COLUMN "adjuntos"."clave_objeto" IS
  'Ruta en S3/MinIO: <tenant_id>/<uuid>, opaca. Nunca derivada de nombre_archivo (ADR-0015). La impone adjuntos_clave_objeto_opaca.';

-- -----------------------------------------------------------------------------
-- 6. Validación de los CHECK: recorre TODAS las filas (la validación no pasa por RLS)
-- -----------------------------------------------------------------------------
ALTER TABLE "mensajes" VALIDATE CONSTRAINT "mensajes_texto_cifrado_completo";
ALTER TABLE "mensajes" VALIDATE CONSTRAINT "mensajes_texto_formato";
ALTER TABLE "conversaciones" VALIDATE CONSTRAINT "conversaciones_ultimo_mensaje_texto_cifrado_completo";
ALTER TABLE "conversaciones" VALIDATE CONSTRAINT "conversaciones_ultimo_mensaje_texto_formato";
ALTER TABLE "conversaciones" VALIDATE CONSTRAINT "conversaciones_ultimo_mensaje_completo";
ALTER TABLE "contactos" VALIDATE CONSTRAINT "contactos_preferencias_cifrado_completo";
ALTER TABLE "contactos" VALIDATE CONSTRAINT "contactos_preferencias_formato";
ALTER TABLE "notas_internas" VALIDATE CONSTRAINT "notas_internas_texto_formato";
ALTER TABLE "adjuntos" VALIDATE CONSTRAINT "adjuntos_nombre_archivo_cifrado_completo";
ALTER TABLE "adjuntos" VALIDATE CONSTRAINT "adjuntos_nombre_archivo_formato";
ALTER TABLE "adjuntos" VALIDATE CONSTRAINT "adjuntos_clave_objeto_opaca";

-- -----------------------------------------------------------------------------
-- 7. RLS y privilegios, por el único mecanismo que los gobierna
--
-- Las cinco tablas ya estaban aisladas; reaplicar es idempotente y deja constancia de que la
-- política no cambia con las columnas nuevas. Privilegios: las columnas nuevas heredan los GRANT
-- de tabla. `registros_auditoria` se reaplica porque desde aquí recibe la lectura auditada.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('mensajes');
SELECT aplicar_aislamiento_tenant('conversaciones');
SELECT aplicar_aislamiento_tenant('contactos');
SELECT aplicar_aislamiento_tenant('notas_internas');
SELECT aplicar_aislamiento_tenant('adjuntos');
SELECT aplicar_aislamiento_tenant('registros_auditoria');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 8. Cinturón: lo que esta migración dice haber hecho, comprobado
-- -----------------------------------------------------------------------------
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

  -- Ninguna de las cinco columnas en claro sigue existiendo.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND (table_name::text, column_name::text) IN (('mensajes', 'texto'),
                                                  ('conversaciones', 'ultimo_mensaje_texto'),
                                                  ('contactos', 'preferencias'),
                                                  ('notas_internas', 'texto'),
                                                  ('adjuntos', 'nombre_archivo'))) THEN
    RAISE EXCEPTION 'Sigue existiendo una columna en claro que el ADR-0015 retira.';
  END IF;

  IF to_regclass('public.mensajes_texto_trgm_idx') IS NOT NULL THEN
    RAISE EXCEPTION 'mensajes_texto_trgm_idx sigue existiendo.';
  END IF;

  -- Los once CHECK, por nombre y VALIDADOS.
  IF (SELECT count(*) FROM pg_constraint
       WHERE contype = 'c'
         AND convalidated
         AND connamespace = 'public'::regnamespace
         AND conname IN ('mensajes_texto_cifrado_completo',
                         'mensajes_texto_formato',
                         'conversaciones_ultimo_mensaje_texto_cifrado_completo',
                         'conversaciones_ultimo_mensaje_texto_formato',
                         'conversaciones_ultimo_mensaje_completo',
                         'contactos_preferencias_cifrado_completo',
                         'contactos_preferencias_formato',
                         'notas_internas_texto_formato',
                         'adjuntos_nombre_archivo_cifrado_completo',
                         'adjuntos_nombre_archivo_formato',
                         'adjuntos_clave_objeto_opaca')) <> 11 THEN
    RAISE EXCEPTION 'Falta (o no esta validado) algun CHECK del cifrado de campos sensibles.';
  END IF;
END;
$$;
