-- =============================================================================
-- T-217 — la versión de cotización guarda las edades de niños e infantes y la silla de infantes
--
-- Desde T-179 la cotización acepta `edadesNinos`, `edadesInfantes` e `infantesConSilla`, y el
-- cotizador los usa para elegir tarifas («Menor de 2 a 11», «Infante sin silla»). La versión
-- guardada no los conservaba: al volver a cotizar desde una versión de un producto con tarifa de
-- menor, la composición llegaba sin edades y la API respondía 422
-- (`TARIFAS_CON_CONDICION_NO_EVALUABLE`). La versión tampoco probaba A QUIÉN se le cobró la
-- tarifa de menor.
--
-- Qué hace, en orden:
--   1. `edades_ninos SMALLINT[] NOT NULL DEFAULT '{}'` y `edades_infantes SMALLINT[] NOT NULL
--      DEFAULT '{}'`. Arreglo vacío = «no se declararon» (versión anterior a T-217, o cotizada sin
--      edades). No hay ambigüedad con «cero niños»: el CHECK exige que, si el arreglo no está
--      vacío, tenga EXACTAMENTE `ninos` (o `infantes`) elementos, que es la misma regla del
--      contrato (`coherenciaDeEdades`).
--   2. `infantes_con_silla SMALLINT` NULABLE. Nulo = no se declaró; aquí el nulo sí hace falta,
--      porque 0 («ninguno ocupa silla») es una respuesta distinta de «no se preguntó».
--   3. Tres CHECK en dos pasos (NOT VALID + VALIDATE).
--   4. RLS reaplicada por el único mecanismo que la gobierna, y el cinturón.
--
-- **Por qué arreglos NOT NULL y no nulables.** Prisma no modela listas escalares opcionales
-- (`Int[]?` no existe): una columna de arreglo nulable se leería como `null` con un tipo que dice
-- `number[]`. El precedente del esquema es el mismo (`roles.permisos`, `contactos.etiquetas`:
-- `TEXT[] NOT NULL DEFAULT '{}'`).
--
-- **Por qué el CHECK no fija el tope de edad (17, 5).** Ese tope es del contrato y puede moverse
-- (un mayorista que llama «infante» hasta los 2 años). La base impone lo que es invariante: edad
-- no negativa, sin nulos dentro del arreglo, una dimensión y la longitud coherente con el conteo.
--
-- **El disparador de inmutabilidad no estorba ni se debilita.** `versiones_cotizacion_inmutables`
-- rechaza TODO UPDATE sin listar columnas, así que las nuevas quedan congeladas igual que las
-- demás. `ADD COLUMN` con DEFAULT constante (PG ≥ 11) es un cambio de catálogo: no reescribe filas
-- ni dispara disparadores de fila. Las versiones existentes NO se rellenan: una versión es
-- inmutable y no se reescribe la prueba; quedan con `{}` / NULL, que es la verdad («no se
-- declararon»).
--
-- **Segura en caliente.** Columnas con DEFAULT constante (catálogo); CHECK `NOT VALID` (catálogo)
-- y `VALIDATE` con SHARE UPDATE EXCLUSIVE, que no bloquea lecturas ni escrituras. Toda fila
-- existente tiene `{}` y NULL, así que la validación no puede fallar.
--
-- **REVERSIBLE** con una migración posterior:
--   ALTER TABLE "versiones_cotizacion"
--     DROP CONSTRAINT "versiones_cotizacion_edades_ninos_coherentes",
--     DROP CONSTRAINT "versiones_cotizacion_edades_infantes_coherentes",
--     DROP CONSTRAINT "versiones_cotizacion_infantes_con_silla_valido",
--     DROP COLUMN "edades_ninos", DROP COLUMN "edades_infantes", DROP COLUMN "infantes_con_silla";
-- Lo que se pierde son las edades de las versiones creadas después de esta migración; el total y
-- las líneas (a quién se cobró qué) siguen en `lineas` y `venta_unidades`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1 y 2. Las columnas
-- -----------------------------------------------------------------------------
ALTER TABLE "versiones_cotizacion"
  ADD COLUMN "edades_ninos" SMALLINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "edades_infantes" SMALLINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "infantes_con_silla" SMALLINT;

COMMENT ON COLUMN "versiones_cotizacion"."edades_ninos" IS
  'Edad de cada niño con la que se cotizó (T-179/T-217). Vacío = no se declararon (o versión anterior a T-217); si no, exactamente `ninos` elementos. Inmutable como el resto de la versión.';
COMMENT ON COLUMN "versiones_cotizacion"."edades_infantes" IS
  'Edad de cada infante con la que se cotizó (T-179/T-217). Vacío = no se declararon (o versión anterior a T-217); si no, exactamente `infantes` elementos. Inmutable como el resto de la versión.';
COMMENT ON COLUMN "versiones_cotizacion"."infantes_con_silla" IS
  'Cuántos infantes ocupan silla propia (T-179/T-217). NULL = no se declaró (distinto de 0). Inmutable como el resto de la versión.';

-- -----------------------------------------------------------------------------
-- 3. Los CHECK, en dos pasos
--
-- `0 <= ALL(arr)` es NULL si el arreglo trae un NULL dentro, y un CHECK que da NULL PASA: por eso
-- `array_position(arr, NULL) IS NULL` va aparte. `cardinality` cuenta todos los elementos de
-- cualquier dimensión: se exige una sola (`array_ndims` es NULL en el arreglo vacío).
-- -----------------------------------------------------------------------------
ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_edades_ninos_coherentes"
  CHECK (
    (cardinality("edades_ninos") = 0 OR cardinality("edades_ninos") = "ninos")
    AND COALESCE(array_ndims("edades_ninos"), 1) = 1
    AND array_position("edades_ninos", NULL) IS NULL
    AND 0 <= ALL ("edades_ninos")
  ) NOT VALID;

ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_edades_infantes_coherentes"
  CHECK (
    (cardinality("edades_infantes") = 0 OR cardinality("edades_infantes") = "infantes")
    AND COALESCE(array_ndims("edades_infantes"), 1) = 1
    AND array_position("edades_infantes", NULL) IS NULL
    AND 0 <= ALL ("edades_infantes")
  ) NOT VALID;

ALTER TABLE "versiones_cotizacion"
  ADD CONSTRAINT "versiones_cotizacion_infantes_con_silla_valido"
  CHECK ("infantes_con_silla" IS NULL
         OR ("infantes_con_silla" >= 0 AND "infantes_con_silla" <= "infantes")) NOT VALID;

ALTER TABLE "versiones_cotizacion"
  VALIDATE CONSTRAINT "versiones_cotizacion_edades_ninos_coherentes";
ALTER TABLE "versiones_cotizacion"
  VALIDATE CONSTRAINT "versiones_cotizacion_edades_infantes_coherentes";
ALTER TABLE "versiones_cotizacion"
  VALIDATE CONSTRAINT "versiones_cotizacion_infantes_con_silla_valido";

-- -----------------------------------------------------------------------------
-- 4. RLS y privilegios, por el único mecanismo que los gobierna
--
-- La tabla ya estaba aislada; reaplicar es idempotente y deja constancia de que la política no
-- cambia con las columnas nuevas. Privilegios: una columna nueva hereda los GRANT de tabla.
-- -----------------------------------------------------------------------------
SELECT aplicar_aislamiento_tenant('versiones_cotizacion');
SELECT aplicar_privilegios_declarados();

-- -----------------------------------------------------------------------------
-- 5. Cinturón: lo que esta migración dice haber hecho, comprobado
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

  -- Los tres CHECK, por nombre y VALIDADOS.
  IF (SELECT count(*) FROM pg_constraint
       WHERE contype = 'c'
         AND conrelid = 'public.versiones_cotizacion'::regclass
         AND convalidated
         AND conname IN ('versiones_cotizacion_edades_ninos_coherentes',
                         'versiones_cotizacion_edades_infantes_coherentes',
                         'versiones_cotizacion_infantes_con_silla_valido')) <> 3 THEN
    RAISE EXCEPTION 'Falta (o no esta validado) algun CHECK de edades en versiones_cotizacion.';
  END IF;

  -- Los tres disparadores de la versión siguen armados: las columnas nuevas no abren una puerta.
  IF (SELECT count(*) FROM pg_trigger
       WHERE tgrelid = 'public.versiones_cotizacion'::regclass
         AND NOT tgisinternal
         AND tgenabled = 'O'
         AND tgname IN ('versiones_cotizacion_inmutables',
                        'versiones_cotizacion_sin_truncate',
                        'versiones_cotizacion_validar_alta')) <> 3 THEN
    RAISE EXCEPTION 'Algun disparador de versiones_cotizacion no esta habilitado.';
  END IF;
END;
$$;
