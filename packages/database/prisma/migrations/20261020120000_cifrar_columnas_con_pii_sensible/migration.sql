-- =============================================================================
-- ADR-0015 — Cifrado de las columnas con PII sensible de viajeros (opción A)
--
-- Las cinco columnas que la tabla de alcance marca «Cifrar» dejan de existir en claro. Cada
-- una pasa a CUATRO columnas, con el mismo patrón que `cuentas_whatsapp.token_*` y
-- `recepciones_webhook.payload_*`:
--
--   <col>_cifrado        BYTEA     el criptograma AES-256-GCM (sin nonce ni etiqueta)
--   <col>_nonce          BYTEA     12 bytes aleatorios por cifrado (concreción 2)
--   <col>_tag            BYTEA     16 bytes de la etiqueta GCM
--   <col>_clave_version  SMALLINT  la `v<n>` de CAMPOS_SENSIBLES_KEY_v<n> (>= 1)
--
-- Las cuatro van juntas o no van (`num_nonnulls(...) IN (0, 4)`): un BYTEA suelto no se
-- distingue de un BYTEA con el texto en claro, y un criptograma sin versión no se puede
-- rotar. Con el CHECK, una fila con un valor en estas columnas TIENE versión, nonce de 96
-- bits y etiqueta de 128: el formato cifrado es un invariante de fila, no una costumbre.
--
--   mensajes.texto                         -> texto_*                (anulable)
--   conversaciones.ultimo_mensaje_texto    -> ultimo_mensaje_texto_* (anulable)
--   contactos.preferencias                 -> preferencias_*         (anulable)
--   notas_internas.texto                   -> texto_*                (NOT NULL: una nota sin texto no es nota)
--   adjuntos.nombre_archivo                -> nombre_archivo_*       (anulable)
--
-- Por qué BYTEA en cuatro columnas y no un TEXT con un sobre versionado: es lo que fija el
-- ADR (opción A, «cada columna en claro pasa a cuatro»), y es lo que permite que la BASE
-- imponga el formato. Un TEXT `v1:...` solo se puede vigilar con una expresión regular,
-- y una regex no distingue un base64 de un texto que casualmente empiece por `v1:`.
--
-- Clave, AAD y longitud los pone la aplicación (concreciones 1–3): HKDF por agencia y por
-- columna, AAD = etiqueta ‖ tenant_id ‖ id de la fila ‖ código de columna. Los topes de
-- longitud que imponía el VARCHAR (200, 255, 2000) los impone ahora la API antes de
-- cifrar; aquí queda un tope de bytes del criptograma (GCM no expande: bytes = bytes UTF-8
-- del claro, como mucho 4 por carácter) para que un error de la aplicación no meta un
-- documento entero en una vista previa.
--
-- -----------------------------------------------------------------------------
-- LAS FILAS EXISTENTES
-- -----------------------------------------------------------------------------
-- El ADR («Por qué ahora»): no hay datos de producción; local, CI y la rama de desarrollo de
-- Neon son semillas y fixtures. **No hay paso de claro a cifrado**: las columnas en claro se
-- ELIMINAN (DROP COLUMN), con lo que el texto deja de existir en el mismo instante en que
-- aparecen las columnas cifradas. No hay ni un segundo de convivencia, ni un marcador
-- que mantener. Las semillas se vuelven a sembrar cifradas por la API.
--
--   - mensajes, conversaciones, contactos y adjuntos: la fila sigue; su texto queda NULO en
--     las cuatro columnas (num_nonnulls = 0), que es un estado legal.
--   - notas_internas: una nota sin texto no es representable, así que las notas de
--     desarrollo se BORRAN antes de añadir las columnas NOT NULL. Si este DELETE no
--     alcanzara alguna fila (por ejemplo, porque el rol que migra no se salta la RLS), el
--     `ADD COLUMN ... NOT NULL` siguiente revienta: la migración no puede terminar dejando
--     notas sin texto.
--   - adjuntos.clave_objeto: las claves que no cumplen `<tenant_id>/<uuid>` se anulan
--     (y su `descargado_en`, que sin clave no es verdad) antes de imponer el CHECK. Mismo
--     razonamiento: si no se anularan, el CHECK revienta.
--
-- **NO ES REVERSIBLE**, y se declara: el texto en claro se destruye. Revertir el ESQUEMA es
-- una migración nueva que recree las columnas en claro y descifre por lotes desde la
-- aplicación (ADR-0015, «Qué habría que cambiar para revertir esto»); el contenido de
-- desarrollo que se borra aquí se recupera volviendo a sembrar, no desde la base.
--
-- -----------------------------------------------------------------------------
-- SEGURA EN CALIENTE
-- -----------------------------------------------------------------------------
-- DROP COLUMN y ADD COLUMN anulable sin DEFAULT solo tocan el catálogo. Los CHECK nuevos
-- recorren la tabla, que hoy son filas de desarrollo. El NOT NULL de notas_internas cae
-- sobre una tabla vacía. DROP INDEX toma ACCESS EXCLUSIVE sobre `mensajes` lo que tarda
-- en borrar el fichero del índice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. mensajes.texto — y el índice trigram, que ya no tiene sobre qué buscar
-- -----------------------------------------------------------------------------
-- Concreción 5: la búsqueda de la bandeja (`ConsultarBandeja.buscar`) pasa a ser por nombre
-- y teléfono del contacto. Lo acepta `dueno-de-producto`. El índice se borra ANTES que la
-- columna para que su desaparición conste aquí con nombre y no como efecto colateral.
DROP INDEX IF EXISTS "mensajes_texto_trgm_idx";

ALTER TABLE "mensajes" DROP COLUMN "texto";

ALTER TABLE "mensajes"
  ADD COLUMN "texto_cifrado"       BYTEA,
  ADD COLUMN "texto_nonce"         BYTEA,
  ADD COLUMN "texto_tag"           BYTEA,
  ADD COLUMN "texto_clave_version" SMALLINT;

ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_texto_cifrado_completo"
  CHECK (num_nonnulls("texto_cifrado", "texto_nonce", "texto_tag", "texto_clave_version") IN (0, 4));
ALTER TABLE "mensajes" ADD CONSTRAINT "mensajes_texto_formato"
  CHECK (
    ("texto_nonce" IS NULL OR octet_length("texto_nonce") = 12)
    AND ("texto_tag" IS NULL OR octet_length("texto_tag") = 16)
    AND ("texto_clave_version" IS NULL OR "texto_clave_version" >= 1)
  );

COMMENT ON COLUMN "mensajes"."texto_cifrado" IS
  'ADR-0015. Texto del mensaje cifrado con AES-256-GCM desde la API o el trabajador. Nunca en claro. Va con texto_nonce, texto_tag y texto_clave_version, o no va.';

-- -----------------------------------------------------------------------------
-- 2. conversaciones.ultimo_mensaje_texto
-- -----------------------------------------------------------------------------
-- El CHECK de la vista previa nombra la columna vieja: DROP COLUMN lo borraría en silencio.
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
  ) IN (0, 4));
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_ultimo_mensaje_texto_formato"
  CHECK (
    ("ultimo_mensaje_texto_nonce" IS NULL OR octet_length("ultimo_mensaje_texto_nonce") = 12)
    AND ("ultimo_mensaje_texto_tag" IS NULL OR octet_length("ultimo_mensaje_texto_tag") = 16)
    AND ("ultimo_mensaje_texto_clave_version" IS NULL OR "ultimo_mensaje_texto_clave_version" >= 1)
    -- 200 caracteres del contrato, a 4 bytes como mucho cada uno.
    AND ("ultimo_mensaje_texto_cifrado" IS NULL OR octet_length("ultimo_mensaje_texto_cifrado") <= 800)
  );

-- La misma regla de antes: la vista previa y su instante van juntos o no van.
ALTER TABLE "conversaciones" ADD CONSTRAINT "conversaciones_ultimo_mensaje_completo"
  CHECK (
    ("ultimo_mensaje_en" IS NULL AND "ultimo_mensaje_direccion" IS NULL AND "ultimo_mensaje_texto_cifrado" IS NULL)
    OR ("ultimo_mensaje_en" IS NOT NULL AND "ultimo_mensaje_direccion" IS NOT NULL)
  );

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
  ) IN (0, 4));
ALTER TABLE "contactos" ADD CONSTRAINT "contactos_preferencias_formato"
  CHECK (
    ("preferencias_nonce" IS NULL OR octet_length("preferencias_nonce") = 12)
    AND ("preferencias_tag" IS NULL OR octet_length("preferencias_tag") = 16)
    AND ("preferencias_clave_version" IS NULL OR "preferencias_clave_version" >= 1)
    AND ("preferencias_cifrado" IS NULL OR octet_length("preferencias_cifrado") <= 8000)
  );

COMMENT ON COLUMN "contactos"."preferencias_cifrado" IS
  'ADR-0015. Preferencias del contacto (alergias: dato de salud, Ley 1581) cifradas con AES-256-GCM. AAD con el id del contacto.';

-- -----------------------------------------------------------------------------
-- 4. notas_internas.texto — obligatorio
-- -----------------------------------------------------------------------------
-- Notas de desarrollo: se borran (ver cabecera). Borrado FÍSICO a propósito y solo aquí:
-- el borrado lógico dejaría filas que incumplen el NOT NULL de abajo.
DELETE FROM "notas_internas";

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
    AND octet_length("texto_cifrado") BETWEEN 1 AND 8000
  );

COMMENT ON COLUMN "notas_internas"."texto_cifrado" IS
  'ADR-0015. Lo que el asesor anota del viajero, cifrado con AES-256-GCM. Obligatorio: una nota sin texto no es representable.';

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
  ) IN (0, 4));
ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_nombre_archivo_formato"
  CHECK (
    ("nombre_archivo_nonce" IS NULL OR octet_length("nombre_archivo_nonce") = 12)
    AND ("nombre_archivo_tag" IS NULL OR octet_length("nombre_archivo_tag") = 16)
    AND ("nombre_archivo_clave_version" IS NULL OR "nombre_archivo_clave_version" >= 1)
    AND ("nombre_archivo_cifrado" IS NULL OR octet_length("nombre_archivo_cifrado") <= 1020)
  );

COMMENT ON COLUMN "adjuntos"."nombre_archivo_cifrado" IS
  'ADR-0015. Nombre que eligio el viajero («pasaporte_AB123456.jpg»), cifrado con AES-256-GCM. AAD con el id del adjunto.';

-- La exigencia del ADR sobre `clave_objeto`: identificador OPACO `<tenant_id>/<uuid>`, nunca
-- derivado de `nombre_archivo` (si lo fuera, dejaría en claro lo que se acaba de cifrar).
-- La base puede imponerlo entero: el prefijo es EXACTAMENTE el tenant de la fila (S3 no
-- tiene RLS; ADR-0003) y lo que sigue es un UUID en minúsculas, sin extensión ni carpetas.
UPDATE "adjuntos"
   SET "clave_objeto" = NULL,
       "descargado_en" = NULL
 WHERE "clave_objeto" IS NOT NULL
   AND NOT (
     "clave_objeto" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     AND split_part("clave_objeto", '/', 1) = "tenant_id"::text
   );

ALTER TABLE "adjuntos" ADD CONSTRAINT "adjuntos_clave_objeto_opaca"
  CHECK (
    "clave_objeto" IS NULL
    OR (
      "clave_objeto" ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part("clave_objeto", '/', 1) = "tenant_id"::text
    )
  );

COMMENT ON COLUMN "adjuntos"."clave_objeto" IS
  'Ruta en S3/MinIO: <tenant_id>/<uuid>, opaca. Nunca derivada de nombre_archivo (ADR-0015). La impone adjuntos_clave_objeto_opaca.';
