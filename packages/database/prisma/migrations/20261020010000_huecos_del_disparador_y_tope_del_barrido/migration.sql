-- =============================================================================
-- Los cuatro huecos del disparador de estado (ADR-0010 §1.1 punto 6) y el tope del barrido
-- (cola de v0.30.0)
--
-- Ninguno de los huecos era fuga: la escritura exige la conjunción del directorio y de
-- `canales` en ACTIVO (`procesar-change.ts`). Pero el directorio mentía, y lo que decide a
-- qué agencia va un change no puede mentir. Los cuatro:
--
--   (a) La baja de una CUENTA (`cuentas_whatsapp.estado`) no tocaba sus filas WABA.
--   (b) El BORRADO LÓGICO (`eliminado_en`, de canal o de cuenta) no propagaba.
--   (c) El RE-ALTA: `registrar_enrutamiento` podía escribir ACTIVO sobre un canal que
--       seguía REVOCADO.
--   (d) El disparador no actuaba en INSERT: un canal que nace REVOCADO no se propagaba.
--
-- La regla es la misma de 20261019120000 y no se toca: MONÓTONA, solo restringe y nunca
-- relaja, con asiento en el historial. El estado EFECTIVO de un canal o de una cuenta es
-- REVOCADO si tiene `eliminado_en`, y su `estado` si no.
--
-- (a), (b) y (d) son disparadores: `propagar_estado_canal` se rehace para mirar también
-- `eliminado_en` y su disparador escucha INSERT y `eliminado_en`; la nueva
-- `propagar_estado_cuenta` es su gemela sobre `cuentas_whatsapp` y alcanza solo las filas
-- WABA (`cuenta_id = NEW.id AND tenant_resuelto_id = NEW.tenant_id`). Las filas de NÚMERO
-- de una cuenta dada de baja no se tocan desde aquí: su verdad es `canales`, y la baja de
-- una cuenta tiene que dar de baja sus canales (eso es del caso de uso, no del motor).
--
-- (c) obliga a `registrar_enrutamiento` a LEER el estado del canal o de la cuenta. Su dueño,
-- `viajapro_enrutador`, no tenía ningún privilegio sobre tablas de negocio, y 20261019120000
-- rechazó dárselo para el RESOLVEDOR porque corre sin contexto de tenant: sería una lectura
-- entre tenants. Aquí no lo es. `registrar_enrutamiento` exige ya que el tenant de la sesión
-- sea el de la fila, y la RLS forzada de `canales` y `cuentas_whatsapp` vale también para
-- el dueño de la función: lee solo la agencia de la sesión, y sin contexto lee cero filas.
-- Se concede SELECT sobre CUATRO columnas (`id`, `tenant_id`, `estado`, `eliminado_en`),
-- nunca el `phone_number_id` ni el token, y nada de escritura. Aserción 57.
--
-- La carrera entre un re-alta y una baja concurrente se cierra con un bloqueo consultivo
-- de transacción por canal (o por cuenta), que toman los dos lados ANTES de leer: el
-- disparador y `registrar_enrutamiento`. Sin él, el alta leía ACTIVO con la instantánea
-- previa a una baja aún sin confirmar, y el disparador de esa baja no veía la fila recién
-- insertada: los dos confirmaban y el directorio quedaba ACTIVO sobre un canal REVOCADO.
--
-- El barrido: `recepciones_webhook_changes.intentos_barrido` cuenta los reencolados en la
-- base (hasta hoy el contador vivía en Redis y la base no podía usarlo).
-- `listar_changes_pendientes` gana un tercer argumento, el tope, con DEFAULT 10 para que la
-- llamada de dos argumentos del trabajador siga resolviendo; excluye a los que pasaron del
-- tope y devuelve primero a los que menos llevan. `contar_reencolado_barrido` suma uno y
-- devuelve el total. Con más de 500 abandonados, los nuevos ya no quedan tapados.
--
-- Funciones SECURITY DEFINER: de nueve a once. Inventario de ADR-0010 §1.2 y matriz de la
-- aserción 20 actualizados en el mismo cambio.
--
-- REVERSIBLE, con pérdida de las restricciones nuevas:
--   DROP TRIGGER cuentas_whatsapp_propagar_estado ON cuentas_whatsapp;
--   DROP FUNCTION propagar_estado_cuenta(); DROP FUNCTION contar_reencolado_barrido(bytea, smallint);
--   recrear canales_propagar_estado y propagar_estado_canal como en 20261019120000;
--   recrear registrar_enrutamiento como en 20261007140100;
--   DROP FUNCTION listar_changes_pendientes(integer, integer, integer) y recrear la de dos
--   argumentos como en 20261019210000;
--   REVOKE SELECT ON canales, cuentas_whatsapp FROM viajapro_enrutador;
--   ALTER TABLE recepciones_webhook_changes DROP COLUMN intentos_barrido.
-- Las filas que esta migración restringe y sus asientos se quedan: reflejan la verdad.
--
-- En caliente: `ADD COLUMN ... NOT NULL DEFAULT 0` es solo de catálogo desde PostgreSQL 11.
-- La reconciliación del final solo toma bloqueos de fila sobre `canales` y
-- `cuentas_whatsapp`, que son tablas pequeñas.
-- =============================================================================

-- Claves de los bloqueos consultivos. Constantes literales en los dos lados; se documentan
-- aquí una vez: 7410100 = canal, 7410101 = cuenta. El segundo entero es `hashtext(id)`:
-- una colisión solo serializa de más, nunca de menos.

-- Poseer funciones nuevas y reemplazar las existentes exige CREATE sobre el esquema. Se
-- presta y se retira antes de terminar (aserción 21).
GRANT CREATE ON SCHEMA public TO viajapro_enrutador, viajapro_staging;

-- -----------------------------------------------------------------------------
-- 1. Lo que el dueño del directorio puede leer de las tablas de negocio
-- -----------------------------------------------------------------------------
GRANT SELECT ("id", "tenant_id", "estado", "eliminado_en") ON public.canales TO viajapro_enrutador;
GRANT SELECT ("id", "tenant_id", "estado", "eliminado_en") ON public.cuentas_whatsapp TO viajapro_enrutador;

-- -----------------------------------------------------------------------------
-- 2. `propagar_estado_canal`, con el estado efectivo y el bloqueo
-- -----------------------------------------------------------------------------
SET ROLE viajapro_enrutador;

CREATE OR REPLACE FUNCTION public.propagar_estado_canal()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_estado public.estado_enrutamiento := CASE
    WHEN NEW.eliminado_en IS NOT NULL THEN 'REVOCADO'::public.estado_enrutamiento
    ELSE NEW.estado::text::public.estado_enrutamiento
  END;
  v_fila   record;
BEGIN
  -- Antes de leer el directorio: serializa con un `registrar_enrutamiento` concurrente
  -- sobre el mismo canal. Ver la cabecera.
  PERFORM pg_catalog.pg_advisory_xact_lock(7410100, pg_catalog.hashtext(NEW.id::text));

  FOR v_fila IN
    SELECT e.clave_canal_hmac, e.estado, e.pimienta_version
    FROM public.enrutamiento_canales e
    WHERE e.canal_id = NEW.id
      AND e.tenant_resuelto_id = NEW.tenant_id
      AND e.estado < v_estado
    FOR UPDATE
  LOOP
    UPDATE public.enrutamiento_canales
       SET estado = v_estado
     WHERE clave_canal_hmac = v_fila.clave_canal_hmac;

    INSERT INTO public.enrutamiento_historial
      (canal_id, cuenta_id, clave_canal_hmac, pimienta_version,
       tenant_anterior, tenant_nuevo, estado_anterior, estado_nuevo,
       actor_usuario_id, actor_tenant_id, motivo)
    VALUES
      (NEW.id, NULL, v_fila.clave_canal_hmac, v_fila.pimienta_version,
       NEW.tenant_id, NEW.tenant_id, v_fila.estado, v_estado,
       NEW.actualizado_por, NEW.tenant_id,
       CASE WHEN NEW.eliminado_en IS NOT NULL
            THEN 'propagado desde canales.eliminado_en'
            ELSE 'propagado desde canales.estado' END);
  END LOOP;

  RETURN NULL;
END;
$func$;

-- -----------------------------------------------------------------------------
-- 3. `propagar_estado_cuenta`, su gemela sobre las filas WABA
-- -----------------------------------------------------------------------------
CREATE FUNCTION public.propagar_estado_cuenta()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_estado public.estado_enrutamiento := CASE
    WHEN NEW.eliminado_en IS NOT NULL THEN 'REVOCADO'::public.estado_enrutamiento
    ELSE NEW.estado::text::public.estado_enrutamiento
  END;
  v_fila   record;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(7410101, pg_catalog.hashtext(NEW.id::text));

  FOR v_fila IN
    SELECT e.clave_canal_hmac, e.estado, e.pimienta_version
    FROM public.enrutamiento_canales e
    WHERE e.cuenta_id = NEW.id
      AND e.tenant_resuelto_id = NEW.tenant_id
      AND e.estado < v_estado
    FOR UPDATE
  LOOP
    UPDATE public.enrutamiento_canales
       SET estado = v_estado
     WHERE clave_canal_hmac = v_fila.clave_canal_hmac;

    INSERT INTO public.enrutamiento_historial
      (canal_id, cuenta_id, clave_canal_hmac, pimienta_version,
       tenant_anterior, tenant_nuevo, estado_anterior, estado_nuevo,
       actor_usuario_id, actor_tenant_id, motivo)
    VALUES
      (NULL, NEW.id, v_fila.clave_canal_hmac, v_fila.pimienta_version,
       NEW.tenant_id, NEW.tenant_id, v_fila.estado, v_estado,
       NEW.actualizado_por, NEW.tenant_id,
       CASE WHEN NEW.eliminado_en IS NOT NULL
            THEN 'propagado desde cuentas_whatsapp.eliminado_en'
            ELSE 'propagado desde cuentas_whatsapp.estado' END);
  END LOOP;

  RETURN NULL;
END;
$func$;

REVOKE ALL ON FUNCTION public.propagar_estado_cuenta() FROM PUBLIC;
COMMENT ON FUNCTION public.propagar_estado_cuenta() IS
  'Lleva a las filas WABA del directorio la restricción de estado o el borrado lógico de una cuenta. Monótona: nunca relaja. Décima función SECURITY DEFINER; sin EXECUTE para nadie.';
COMMENT ON FUNCTION public.propagar_estado_canal() IS
  'Lleva al directorio la restricción de estado (SUSPENDIDO/REVOCADO) o el borrado lógico de un canal, también al insertarlo. Monótona: nunca relaja.';

-- -----------------------------------------------------------------------------
-- 4. `registrar_enrutamiento` no escribe un estado más laxo que el efectivo
--
-- Cuerpo de 20261007140100 más un bloque, marcado. Misma firma: se conservan el dueño y la
-- concesión a `viajapro_altas`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_enrutamiento(
  p_clave bytea,
  p_pimienta_version smallint,
  p_tenant uuid,
  p_canal_id uuid,
  p_cuenta_id uuid,
  p_estado public.estado_enrutamiento,
  p_actor_usuario_id uuid,
  p_motivo text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_tenant_sesion  uuid;
  v_existe         boolean := false;
  v_tenant_previo  uuid;
  v_estado_previo  public.estado_enrutamiento;
  v_tenant_cuenta  uuid;
  v_canal_fila     uuid;
  v_cuenta_fila    uuid;
  v_estado_origen  public.estado_enrutamiento;
BEGIN
  IF p_clave IS NULL OR p_pimienta_version IS NULL OR p_tenant IS NULL
     OR p_estado IS NULL OR p_motivo IS NULL THEN
    RAISE EXCEPTION 'registrar_enrutamiento: faltan argumentos obligatorios'
      USING ERRCODE = '22023';
  END IF;

  IF p_canal_id IS NULL AND p_cuenta_id IS NULL THEN
    RAISE EXCEPTION 'registrar_enrutamiento: hace falta canal_id o cuenta_id'
      USING ERRCODE = '22023';
  END IF;

  IF p_canal_id IS NOT NULL THEN
    v_canal_fila  := p_canal_id;
    v_cuenta_fila := NULL;
  ELSE
    v_canal_fila  := NULL;
    v_cuenta_fila := p_cuenta_id;
  END IF;

  v_tenant_sesion := NULLIF(pg_catalog.current_setting('app.current_tenant', true), '')::uuid;
  IF v_tenant_sesion IS NULL OR v_tenant_sesion <> p_tenant THEN
    RAISE EXCEPTION 'registrar_enrutamiento: el tenant de la sesión no es el de la fila'
      USING ERRCODE = '42501';
  END IF;

  -- >>> Nuevo (ADR-0010 punto 6, hueco c). El directorio no puede quedar más laxo que la
  -- verdad. Se lee bajo RLS —el tenant de la sesión, que acaba de comprobarse— y tras el
  -- mismo bloqueo consultivo que toma el disparador, para que una baja concurrente o se
  -- vea aquí o vea la fila que se escribe aquí. El filtro por `p_tenant` repite a la RLS
  -- a propósito: si un día la política cambiara, esto seguiría sin ver otra agencia.
  IF v_canal_fila IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(7410100, pg_catalog.hashtext(v_canal_fila::text));
    SELECT CASE WHEN c.eliminado_en IS NOT NULL THEN 'REVOCADO'::public.estado_enrutamiento
                ELSE c.estado::text::public.estado_enrutamiento END
      INTO v_estado_origen
    FROM public.canales c
    WHERE c.id = v_canal_fila AND c.tenant_id = p_tenant;
  ELSE
    PERFORM pg_catalog.pg_advisory_xact_lock(7410101, pg_catalog.hashtext(v_cuenta_fila::text));
    SELECT CASE WHEN w.eliminado_en IS NOT NULL THEN 'REVOCADO'::public.estado_enrutamiento
                ELSE w.estado::text::public.estado_enrutamiento END
      INTO v_estado_origen
    FROM public.cuentas_whatsapp w
    WHERE w.id = v_cuenta_fila AND w.tenant_id = p_tenant;
  END IF;

  -- Si no es visible bajo el tenant que registra —no existe o es de otra agencia— se lanza
  -- aquí. La clave foránea compuesta también lo rechazaría (23503), pero no debe ser la
  -- única defensa, y la comprobación de estado no puede saltarse en silencio. Aserción 60.
  IF v_estado_origen IS NULL THEN
    RAISE EXCEPTION 'registrar_enrutamiento: el % no existe bajo el tenant que registra',
      CASE WHEN v_canal_fila IS NOT NULL THEN 'canal' ELSE 'cuenta' END
      USING ERRCODE = 'P0002';
  END IF;

  IF p_estado < v_estado_origen THEN
    RAISE EXCEPTION 'registrar_enrutamiento: no se registra % sobre un % que está %',
      p_estado, CASE WHEN v_canal_fila IS NOT NULL THEN 'canal' ELSE 'cuenta' END, v_estado_origen
      USING ERRCODE = '55000';
  END IF;
  -- <<< Fin de lo nuevo.

  SELECT e.tenant_resuelto_id, e.estado
    INTO v_tenant_previo, v_estado_previo
  FROM public.enrutamiento_canales e
  WHERE e.clave_canal_hmac = p_clave
  FOR UPDATE;
  v_existe := FOUND;

  IF v_existe AND v_tenant_previo IS DISTINCT FROM p_tenant AND v_estado_previo <> 'REVOCADO' THEN
    RAISE EXCEPTION 'registrar_enrutamiento: la clave pertenece a otro tenant'
      USING ERRCODE = '42501';
  END IF;

  IF p_cuenta_id IS NOT NULL THEN
    SELECT h.tenant_nuevo INTO v_tenant_cuenta
    FROM public.enrutamiento_historial h
    WHERE h.cuenta_id = p_cuenta_id
    ORDER BY h.ocurrido_en DESC
    LIMIT 1;

    IF v_tenant_cuenta IS NOT NULL
       AND v_tenant_cuenta <> p_tenant
       AND NOT (v_existe AND v_estado_previo = 'REVOCADO') THEN
      RAISE EXCEPTION 'registrar_enrutamiento: la cuenta ya está asignada a otro tenant'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.enrutamiento_canales AS d
    (clave_canal_hmac, tenant_resuelto_id, canal_id, cuenta_id, estado, pimienta_version)
  VALUES (p_clave, p_tenant, v_canal_fila, v_cuenta_fila, p_estado, p_pimienta_version)
  ON CONFLICT (clave_canal_hmac) DO UPDATE
    SET tenant_resuelto_id = EXCLUDED.tenant_resuelto_id,
        canal_id           = EXCLUDED.canal_id,
        cuenta_id          = EXCLUDED.cuenta_id,
        estado             = EXCLUDED.estado,
        pimienta_version   = EXCLUDED.pimienta_version;

  INSERT INTO public.enrutamiento_historial
    (canal_id, cuenta_id, clave_canal_hmac, pimienta_version,
     tenant_anterior, tenant_nuevo, estado_anterior, estado_nuevo,
     actor_usuario_id, actor_tenant_id, motivo)
  VALUES
    (p_canal_id, p_cuenta_id, p_clave, p_pimienta_version,
     v_tenant_previo, p_tenant, v_estado_previo, p_estado,
     p_actor_usuario_id, v_tenant_sesion, p_motivo);
END;
$func$;

-- Crear un disparador exige EXECUTE sobre su función, y el rol de migraciones no lo tiene
-- sobre funciones de `viajapro_enrutador` (en Neon no es superusuario). Se presta aquí, por
-- el dueño, y se retira en cuanto existen los dos disparadores.
DO $$
BEGIN
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.propagar_estado_canal() TO %I', session_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.propagar_estado_cuenta() TO %I', session_user);
END;
$$;

RESET ROLE;

-- -----------------------------------------------------------------------------
-- 5. Los dos disparadores: INSERT, estado y borrado lógico
-- -----------------------------------------------------------------------------
DROP TRIGGER canales_propagar_estado ON public.canales;
CREATE TRIGGER canales_propagar_estado
  AFTER INSERT OR UPDATE OF estado, eliminado_en ON public.canales
  FOR EACH ROW
  WHEN (NEW.estado <> 'ACTIVO' OR NEW.eliminado_en IS NOT NULL)
  EXECUTE FUNCTION public.propagar_estado_canal();

CREATE TRIGGER cuentas_whatsapp_propagar_estado
  AFTER INSERT OR UPDATE OF estado, eliminado_en ON public.cuentas_whatsapp
  FOR EACH ROW
  WHEN (NEW.estado <> 'ACTIVO' OR NEW.eliminado_en IS NOT NULL)
  EXECUTE FUNCTION public.propagar_estado_cuenta();

SET ROLE viajapro_enrutador;
DO $$
BEGIN
  EXECUTE format('REVOKE EXECUTE ON FUNCTION public.propagar_estado_canal() FROM %I', session_user);
  EXECUTE format('REVOKE EXECUTE ON FUNCTION public.propagar_estado_cuenta() FROM %I', session_user);
END;
$$;
RESET ROLE;

-- -----------------------------------------------------------------------------
-- 6. El barrido: contar reencolados en la base y no dejar que los abandonados tapen
-- -----------------------------------------------------------------------------
SET ROLE viajapro_staging;

ALTER TABLE public.recepciones_webhook_changes
  ADD COLUMN "intentos_barrido" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.recepciones_webhook_changes
  ADD CONSTRAINT "recepciones_webhook_changes_intentos_barrido_no_negativo"
  CHECK ("intentos_barrido" >= 0);
COMMENT ON COLUMN public.recepciones_webhook_changes.intentos_barrido IS
  'Cuántas veces lo ha reencolado el barrido. Lo suma contar_reencolado_barrido; listar_changes_pendientes excluye a los que pasan del tope y ordena por esto primero.';

-- La firma cambia (tercer argumento), así que no basta CREATE OR REPLACE: sin el DROP
-- quedarían dos sobrecargas, y la aserción 53 exige una.
DROP FUNCTION public.listar_changes_pendientes(integer, integer);

CREATE FUNCTION public.listar_changes_pendientes(
  p_antiguedad_minima_s integer,
  p_limite integer,
  p_max_intentos integer DEFAULT 10
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
  IF p_antiguedad_minima_s IS NULL OR p_limite IS NULL OR p_max_intentos IS NULL THEN
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

  IF p_max_intentos < 0 THEN
    RAISE EXCEPTION 'listar_changes_pendientes: tope de intentos negativo (%)', p_max_intentos
      USING ERRCODE = '22023';
  END IF;

  -- `<=` y no `<`: el barrido cuenta ANTES de reencolar y declara abandonado al que pasa del
  -- tope, así que un change sale una última vez con el contador en el tope, se cuenta,
  -- queda en tope + 1, se registra como abandonado una sola vez y no vuelve a salir.
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
    AND c.intentos_barrido <= p_max_intentos
    AND r.payload_cifrado IS NOT NULL
    AND r.recibido_en <= pg_catalog.now()
                         - pg_catalog.make_interval(secs => p_antiguedad_minima_s)
  ORDER BY c.intentos_barrido, r.recibido_en, c.recepcion_id, c.indice
  LIMIT p_limite;
END;
$func$;

REVOKE ALL ON FUNCTION public.listar_changes_pendientes(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.listar_changes_pendientes(integer, integer, integer) TO viajapro_webhook;
COMMENT ON FUNCTION public.listar_changes_pendientes(integer, integer, integer) IS
  'Relay de barrido (ADR-0010 punto 9): changes PENDIENTES con contenido, más de N segundos y como mucho M reencolados, los de menos reencolados primero. Solo identificadores y antigüedad, nunca payload ni tenant; límite obligatorio 1..1000. EXECUTE solo para viajapro_webhook.';

-- Undécima. Suma uno al change si sigue PENDIENTE y devuelve el total; 0 si ya se resolvió
-- o no existe (el barrido lo reencola y `tomar_recepcion` lo encontrará resuelto). Solo
-- toca la columna del contador: no puede cambiar el estado ni el contenido.
CREATE FUNCTION public.contar_reencolado_barrido(
  p_recepcion_id bytea,
  p_indice smallint
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_total integer;
BEGIN
  IF p_recepcion_id IS NULL OR p_indice IS NULL THEN
    RAISE EXCEPTION 'contar_reencolado_barrido: ningún argumento puede ser nulo'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.recepciones_webhook_changes c
     SET intentos_barrido = LEAST(c.intentos_barrido + 1, 32767)
   WHERE c.recepcion_id = p_recepcion_id
     AND c.indice = p_indice
     AND c.estado = 'PENDIENTE'
  RETURNING c.intentos_barrido INTO v_total;

  RETURN COALESCE(v_total, 0);
END;
$func$;

REVOKE ALL ON FUNCTION public.contar_reencolado_barrido(bytea, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contar_reencolado_barrido(bytea, smallint) TO viajapro_webhook;
COMMENT ON FUNCTION public.contar_reencolado_barrido(bytea, smallint) IS
  'Cuenta un reencolado del barrido sobre un change PENDIENTE y devuelve el total (0 si ya no está pendiente). Undécima función SECURITY DEFINER; EXECUTE solo para viajapro_webhook.';

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_enrutador, viajapro_staging;

-- -----------------------------------------------------------------------------
-- 7. Reconciliar lo que ya hubiera divergido, disparando los disparadores
--
-- Igual que 20261019120000: el rol de migraciones no posee el directorio, y así queda el
-- mismo asiento que en el camino normal.
-- -----------------------------------------------------------------------------
UPDATE public.canales SET eliminado_en = eliminado_en WHERE eliminado_en IS NOT NULL;
UPDATE public.cuentas_whatsapp SET estado = estado
 WHERE estado <> 'ACTIVO' OR eliminado_en IS NOT NULL;
