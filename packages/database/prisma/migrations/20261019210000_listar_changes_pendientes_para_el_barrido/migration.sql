-- =============================================================================
-- El relay de barrido: listar los changes que se quedaron PENDIENTES
-- (ADR-0010 §1.1 punto 9; ADR-0008 §4)
--
-- Hoy, si el POST guarda la recepción y el encolado falla (Redis caído), el change queda
-- PENDIENTE y lo único que lo recupera es un reintento de Meta. No había forma de
-- listarlos: `tomar_recepcion` exige el identificador exacto, a propósito, para que un
-- volcado no exista como operación.
--
-- Esta función es la NOVENA SECURITY DEFINER y abre un listado, así que su forma es la
-- frontera y se fija aquí:
--
--   · Devuelve SOLO `recepcion_id`, `indice` y la antigüedad en segundos. Ni el payload,
--     ni su nonce o etiqueta, ni nada que identifique a un tenant (que además el staging
--     no conoce: el tenant se resuelve al procesar). Es lo justo para reconstruir el
--     `jobId` (`<recepcion_id en hex>-<indice>`, punto 8) y reencolar (R5).
--   · El límite es OBLIGATORIO y acotado (1..1000). Sin límite, un listado es un volcado.
--   · La antigüedad mínima es obligatoria y no negativa. El barrido pide >= 30 s para no
--     competir con el encolado normal del POST.
--   · Excluye las recepciones cuyo contenido ya se anuló (`purgar_payloads`): un change
--     sin contenido no se puede procesar, y reencolarlo sería un bucle infinito.
--   · Orden: las más antiguas primero, para que el límite no deje morir a las de cola.
--   · La ejecuta solo `viajapro_webhook` (el trabajador). La API no: el que recibe no es
--     el que barre.
--
-- Las cuatro reglas de 20261007120300 §7 se cumplen: search_path vacío con todo
-- cualificado, sin SQL dinámico, volatilidad declarada (STABLE: solo lee), y el REVOKE a
-- PUBLIC inmediatamente después de crearla. Se crea bajo `SET ROLE viajapro_staging`, de
-- modo que el dueño es el correcto desde el principio y el REVOKE lo ejecuta su dueño.
-- Sin `STRICT`: un argumento nulo lanza 22023 en vez de devolver cero filas, que el
-- barrido leería como «no hay nada atascado».
--
-- Toda modificación del cuerpo vuelve a pasar por auditoría de seguridad.
--
-- REVERSIBLE: `DROP FUNCTION public.listar_changes_pendientes(integer, integer)` y
-- `DROP INDEX public.recepciones_webhook_changes_pendientes_idx`. No cambia datos.
--
-- En caliente: el índice se crea sin CONCURRENTLY porque Prisma envuelve la migración en
-- transacción. La tabla es el staging, que vive minutos y tiene pocas filas: el bloqueo
-- de escritura dura lo que tarda en indexar esas pocas filas.
-- =============================================================================

-- Poseer un objeto nuevo y crear un índice exigen CREATE sobre el esquema. Se presta y se
-- retira antes de terminar (aserción 21).
GRANT CREATE ON SCHEMA public TO viajapro_staging;

SET ROLE viajapro_staging;

-- Parcial: solo los pendientes, que en régimen normal son casi ninguno. El barrido no
-- recorre los resueltos.
CREATE INDEX IF NOT EXISTS "recepciones_webhook_changes_pendientes_idx"
  ON public.recepciones_webhook_changes ("recepcion_id", "indice")
  WHERE "estado" = 'PENDIENTE';

CREATE FUNCTION public.listar_changes_pendientes(
  p_antiguedad_minima_s integer,
  p_limite integer
)
RETURNS TABLE (
  recepcion_id bytea,
  indice smallint,
  antiguedad_s integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $func$
BEGIN
  IF p_antiguedad_minima_s IS NULL OR p_limite IS NULL THEN
    RAISE EXCEPTION 'listar_changes_pendientes: ningún argumento puede ser nulo'
      USING ERRCODE = '22023';
  END IF;

  IF p_antiguedad_minima_s < 0 THEN
    RAISE EXCEPTION 'listar_changes_pendientes: antigüedad mínima negativa (%)', p_antiguedad_minima_s
      USING ERRCODE = '22023';
  END IF;

  IF p_limite < 1 OR p_limite > 1000 THEN
    RAISE EXCEPTION 'listar_changes_pendientes: límite fuera de rango 1..1000 (%)', p_limite
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT c.recepcion_id,
         c.indice,
         pg_catalog.floor(
           pg_catalog.date_part('epoch', pg_catalog.now() - r.recibido_en)
         )::integer
  FROM public.recepciones_webhook_changes c
  JOIN public.recepciones_webhook r
    ON r.recepcion_id = c.recepcion_id
  WHERE c.estado = 'PENDIENTE'
    AND r.payload_cifrado IS NOT NULL
    AND r.recibido_en <= pg_catalog.now()
                         - pg_catalog.make_interval(secs => p_antiguedad_minima_s)
  ORDER BY r.recibido_en, c.recepcion_id, c.indice
  LIMIT p_limite;
END;
$func$;

REVOKE ALL ON FUNCTION public.listar_changes_pendientes(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_changes_pendientes(integer, integer) TO viajapro_webhook;
COMMENT ON FUNCTION public.listar_changes_pendientes(integer, integer) IS
  'Relay de barrido (ADR-0010 punto 9): changes PENDIENTES con contenido y más de N segundos. Solo identificadores y antigüedad, nunca payload ni tenant; límite obligatorio 1..1000. Novena función SECURITY DEFINER; EXECUTE solo para viajapro_webhook.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_staging;
