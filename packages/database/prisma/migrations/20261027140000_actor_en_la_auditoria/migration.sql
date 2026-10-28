-- =============================================================================
-- T-071 — `registros_auditoria` distingue si el actor fue un usuario o una clave de API
--
-- La API pública (ADR-0017 M3) dejará cambiar precios con una clave de API. Hasta hoy la bitácora
-- solo sabe decir `usuario_id`: un cambio hecho con una clave quedaría con `usuario_id` nulo y sin
-- rastro de quién lo hizo, indistinguible de un registro viejo. Esta migración prepara la columna
-- ANTES de que exista la primera clave, para que ningún cambio por API nazca anónimo.
--
-- Qué hace, en orden:
--   1. Tipo `tipo_de_actor` = USUARIO | CLAVE_DE_API. Enum y no tabla por tenant (R12): no es
--      política de la agencia, es un invariante del sistema (quién puede escribir).
--   2. `registros_auditoria.tipo_de_actor` NULABLE con DEFAULT 'USUARIO', en dos sentencias a
--      propósito: `ADD COLUMN` sin DEFAULT deja las filas existentes en NULL («no registrado»: se
--      escribieron antes de que existiera la distinción) y `SET DEFAULT` solo afecta a las nuevas.
--      Ningún escritor actual cambia: los que no dicen nada quedan como USUARIO, que es lo que son.
--   3. `registros_auditoria.clave_de_api_id` UUID NULABLE, **sin foránea todavía**: la tabla de
--      claves de API (M3) no existe. Cuando exista, su migración añade la foránea COMPUESTA
--      `(clave_de_api_id, tenant_id)` con NOT VALID + VALIDATE. Un identificador suelto no filtra
--      nada entre agencias: la fila que lo lleva está bajo RLS.
--   4. CHECK de coherencia: CLAVE_DE_API ⇔ hay clave, y entonces no hay usuario. Media identidad
--      (una clave con un usuario al lado, o una clave sin tipo) no es representable.
--   5. RLS reaplicada por el único mecanismo que la gobierna (la política no cambia: `tenant_id`
--      sigue NOT NULL y forzado) y el cinturón.
--
-- **Sin datos personales.** Ninguna de las dos columnas es PII: un tipo y un identificador opaco.
-- El historial de precios expone el tipo y, si lo hay, el id de la clave; nunca nombre ni correo.
--
-- **Segura en caliente.** `CREATE TYPE` y `ADD COLUMN` sin DEFAULT son cambios de catálogo;
-- `SET DEFAULT` también (no toca filas). El CHECK se crea NOT VALID (instante de catálogo) y se
-- valida después con SHARE UPDATE EXCLUSIVE, que no bloquea ni lecturas ni inserciones: la
-- bitácora puede ser grande y es de escritura continua. Toda fila existente tiene las dos columnas
-- en NULL, así que la validación no puede fallar.
--
-- **REVERSIBLE** con una migración posterior:
--   ALTER TABLE "registros_auditoria" DROP CONSTRAINT "registros_auditoria_actor_coherente";
--   ALTER TABLE "registros_auditoria" DROP COLUMN "clave_de_api_id", DROP COLUMN "tipo_de_actor";
--   DROP TYPE "tipo_de_actor";
-- Lo que se pierde es la distinción usuario/clave de los registros escritos después de esta
-- migración; `usuario_id`, `accion`, `detalle` y el resto quedan intactos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. El tipo
-- -----------------------------------------------------------------------------
CREATE TYPE "tipo_de_actor" AS ENUM ('USUARIO', 'CLAVE_DE_API');

-- -----------------------------------------------------------------------------
-- 2. Quién actuó: tipo. NULL en lo existente, USUARIO por defecto en lo nuevo.
-- -----------------------------------------------------------------------------
ALTER TABLE "registros_auditoria" ADD COLUMN "tipo_de_actor" "tipo_de_actor";
ALTER TABLE "registros_auditoria" ALTER COLUMN "tipo_de_actor" SET DEFAULT 'USUARIO';

COMMENT ON COLUMN "registros_auditoria"."tipo_de_actor" IS
  'Quién actuó: USUARIO (usuario_id) o CLAVE_DE_API (clave_de_api_id). NULL = registro anterior a T-071, sin la distinción. No es PII.';

-- -----------------------------------------------------------------------------
-- 3. Quién actuó: la clave, cuando fue una clave
-- -----------------------------------------------------------------------------
ALTER TABLE "registros_auditoria" ADD COLUMN "clave_de_api_id" UUID;

COMMENT ON COLUMN "registros_auditoria"."clave_de_api_id" IS
  'La clave de API que actuó, si tipo_de_actor = CLAVE_DE_API. Sin foránea hasta que exista la tabla de claves (ADR-0017 M3); entonces será COMPUESTA con tenant_id.';

-- -----------------------------------------------------------------------------
-- 4. Coherencia del actor, en dos pasos
--
-- `IS DISTINCT FROM` y no `<>`: con `tipo_de_actor` NULL (lo existente) la primera mitad es
-- verdadera y la fila vale, siempre que tampoco tenga clave.
-- -----------------------------------------------------------------------------
ALTER TABLE "registros_auditoria"
  ADD CONSTRAINT "registros_auditoria_actor_coherente"
  CHECK (
    ("tipo_de_actor" IS DISTINCT FROM 'CLAVE_DE_API' AND "clave_de_api_id" IS NULL)
    OR ("tipo_de_actor" = 'CLAVE_DE_API' AND "clave_de_api_id" IS NOT NULL AND "usuario_id" IS NULL)
  )
  NOT VALID;

ALTER TABLE "registros_auditoria" VALIDATE CONSTRAINT "registros_auditoria_actor_coherente";

-- -----------------------------------------------------------------------------
-- 5. RLS y privilegios, por el único mecanismo que los gobierna
--
-- La tabla ya estaba aislada; reaplicar es idempotente. Las columnas nuevas heredan los GRANT de
-- tabla.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('registros_auditoria');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 6. Cinturón: lo que esta migración dice haber hecho, comprobado
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

  -- `tenant_id` sigue NOT NULL: la columna nueva no abrió una fila sin agencia.
  IF NOT (SELECT attnotnull FROM pg_attribute
           WHERE attrelid = 'public.registros_auditoria'::regclass AND attname = 'tenant_id') THEN
    RAISE EXCEPTION 'registros_auditoria.tenant_id dejo de ser NOT NULL.';
  END IF;

  -- La tabla sigue con RLS habilitada Y forzada.
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
           WHERE oid = 'public.registros_auditoria'::regclass) THEN
    RAISE EXCEPTION 'registros_auditoria no tiene RLS habilitada y forzada.';
  END IF;

  -- El CHECK existe y está validado.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.registros_auditoria'::regclass
       AND conname = 'registros_auditoria_actor_coherente'
       AND contype = 'c'
       AND convalidated
  ) THEN
    RAISE EXCEPTION 'Falta (o no esta validado) registros_auditoria_actor_coherente.';
  END IF;

  -- Lo nuevo nace USUARIO. LIKE y no igualdad: el texto del cast lleva o no el esquema según el
  -- search_path de la sesión que migra.
  IF NOT COALESCE((SELECT pg_get_expr(d.adbin, d.adrelid) LIKE '''USUARIO''::%'
                     FROM pg_attrdef d
                     JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
                    WHERE d.adrelid = 'public.registros_auditoria'::regclass
                      AND a.attname = 'tipo_de_actor'), false) THEN
    RAISE EXCEPTION 'El DEFAULT de registros_auditoria.tipo_de_actor no es USUARIO.';
  END IF;
END;
$$;
