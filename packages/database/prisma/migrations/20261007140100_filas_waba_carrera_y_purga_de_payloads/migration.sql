-- =============================================================================
-- Correcciones de la auditoría de implementación de ADR-0008
-- (docs/_auditorias/2026-10-07-implementacion-adr-0008.md)
--
-- Migración NUEVA y no edición de las anteriores: las de ADR-0008 ya están aplicadas.
--
-- Cinco cosas, todas de la misma clase —el sistema sigue funcionando y la protección no
-- está—, más la séptima función:
--
--   1. Las filas WABA no tenían respaldo del motor. La clave foránea compuesta se había
--      aplicado solo a `canal_id`, y las filas WABA son justo las que gobiernan TODOS los
--      eventos de gestión. El índice que lo hacía posible ya existía y no se usó.
--   2. `anular_payload` no cerraba la carrera que C-3 pedía cerrar: cerró la que ocurre
--      entre dos sentencias y dejó intacta la que ocurre entre dos TRANSACCIONES.
--   3. `STRICT` en funciones de escritura: un argumento nulo devolvía NULL sin ejecutar el
--      cuerpo. Un 200 a Meta sin haber insertado nada, y Meta no reintenta.
--   4. Un `change` que nunca se resuelve conservaba el contenido para siempre: ni se
--      anulaba (queda un PENDIENTE) ni se purgaba (la purga respeta los PENDIENTES).
--   5. Las particiones futuras nacían con UPDATE y DELETE para los tres roles de login.
--
-- NO ES REVERSIBLE sin pérdida de la restricción: revertir devuelve las filas WABA a no
-- tener respaldo del motor. Plan de reversión: `ALTER TABLE ... DROP CONSTRAINT` de las
-- tres restricciones nuevas y `DROP FUNCTION` de las dos funciones nuevas; el estado de
-- los datos no cambia porque las tablas están vacías.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Las filas WABA, con respaldo del motor
--
-- `registrar_enrutamiento` no puede comprobarlo —por diseño no tiene privilegios sobre
-- `canales` ni sobre `cuentas_whatsapp`— y lo único que había era una comprobación contra
-- el último asiento del historial, que **no existe la primera vez**. Para las filas de
-- número el motor rechazaba el cruce con 23503; la fila WABA entraba sin protestar, y
-- desde el siguiente webhook de plantilla o de cuenta los eventos de gestión de la agencia
-- ajena se atribuían al atacante.
--
-- Se hace ahora porque la tabla está vacía. Después de la primera fila real es caro.
-- -----------------------------------------------------------------------------

-- Dos permisos prestados, los dos retirados antes de terminar:
--
--   · REFERENCES sobre `cuentas_whatsapp`, porque crear una clave foránea lo exige sobre
--     la tabla referenciada y `viajapro_enrutador` —que es quien tiene que ejecutar el
--     ALTER, por ser el dueño— no tiene ningún privilegio sobre las tablas de negocio.
--   · CREATE sobre el esquema, porque lo exigen tanto poseer una función nueva como
--     **crear un índice**. En estado de reposo nadie salvo el dueño del esquema puede
--     crear nada en `public`, y la aserción 21 lo vigila para los roles de login.
GRANT REFERENCES ON TABLE public.cuentas_whatsapp TO viajapro_enrutador;
GRANT CREATE ON SCHEMA public TO viajapro_enrutador, viajapro_staging;

SET ROLE viajapro_enrutador;

ALTER TABLE public.enrutamiento_canales
  ADD COLUMN IF NOT EXISTS "cuenta_id" UUID;

ALTER TABLE public.enrutamiento_canales
  ADD CONSTRAINT "enrutamiento_canales_cuenta_id_tenant_resuelto_id_fkey"
  FOREIGN KEY ("cuenta_id", "tenant_resuelto_id")
  REFERENCES public.cuentas_whatsapp ("id", "tenant_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Exactamente uno: o la fila es de número, o es de cuenta. Las dos a la vez no significan
-- nada y ninguna de las dos deja la fila sin respaldo del motor.
ALTER TABLE public.enrutamiento_canales
  ADD CONSTRAINT "enrutamiento_canales_una_referencia"
  CHECK (num_nonnulls("canal_id", "cuenta_id") = 1);

-- El índice y el comentario van TAMBIÉN con el rol del dueño: crear un índice o comentar
-- una columna exige ser dueño de la tabla, igual que el ALTER.
CREATE INDEX IF NOT EXISTS "enrutamiento_canales_cuenta_id_idx"
  ON public.enrutamiento_canales ("cuenta_id");

COMMENT ON COLUMN public.enrutamiento_canales.cuenta_id IS
  'Relleno en las filas de tipo WABA, nulo en las de número. Con su clave foránea compuesta es lo que impide que una fila de gestión apunte a la cuenta de otro tenant.';

RESET ROLE;

REVOKE REFERENCES ON TABLE public.cuentas_whatsapp FROM viajapro_enrutador;

-- -----------------------------------------------------------------------------
-- 2. `ocurrido_en` deja de empatar dentro de una transacción
--
-- `CURRENT_TIMESTAMP` es constante durante toda la transacción, así que los dos asientos
-- de un mismo alta —la fila WABA y la del número— tenían la misma marca y
-- `ORDER BY ocurrido_en DESC LIMIT 1` elegía uno arbitrariamente. `clock_timestamp()` lee
-- el reloj en cada fila.
-- -----------------------------------------------------------------------------
SET ROLE viajapro_enrutador;
ALTER TABLE public.enrutamiento_historial
  ALTER COLUMN "ocurrido_en" SET DEFAULT clock_timestamp();
RESET ROLE;

-- -----------------------------------------------------------------------------
-- 3. Un token cifrado a medias deja de ser representable
--
-- Las cuatro columnas eran anulables y nada las ataba: nada distinguía un BYTEA cifrado de
-- uno con el token en claro, y un atajo de depuración incumplía R6 sin romper nada. Para
-- el payload del staging el ADR exigió versión de clave no nula; para los tokens de
-- WhatsApp de terceros no se había exigido nada.
-- -----------------------------------------------------------------------------
ALTER TABLE public.cuentas_whatsapp
  ADD CONSTRAINT "cuentas_whatsapp_token_completo"
  CHECK (num_nonnulls("token_cifrado", "token_nonce", "token_tag", "clave_version") IN (0, 4));

ALTER TABLE public.cuentas_whatsapp
  ADD CONSTRAINT "cuentas_whatsapp_nonce_96_bits"
  CHECK ("token_nonce" IS NULL OR octet_length("token_nonce") = 12);

-- -----------------------------------------------------------------------------
-- 4. Las funciones
-- -----------------------------------------------------------------------------
-- 4.1 `registrar_enrutamiento` guarda `cuenta_id` en las filas WABA.
SET ROLE viajapro_enrutador;

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
  -- Exactamente una de las dos va a la fila del directorio: la otra queda nula y la
  -- restricción lo exige. El historial sí guarda las dos, porque son su índice estable.
  v_canal_fila     uuid;
  v_cuenta_fila    uuid;
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

  -- Comprobación de consistencia de cuenta. Para las filas WABA ya no es la única defensa
  -- —la clave foránea compuesta la respalda—, pero sigue siendo lo que ata las filas de
  -- NÚMERO de un WABA al tenant de su cuenta, que el motor no puede ver desde aquí.
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

RESET ROLE;

-- 4.2 El staging: sin `STRICT`, con la carrera cerrada de verdad y con el `ROW_COUNT`
--     correcto.
SET ROLE viajapro_staging;

-- `STRICT` fuera. Una función `STRICT` devuelve NULL **sin ejecutar el cuerpo** si algún
-- argumento es nulo: en una función de lectura es lo que §1.4 quería; en una de escritura
-- convierte un error de programación en un no-op indistinguible del éxito. Un
-- `p_payload_tag` nulo —algo que ocurre con solo concatenar la etiqueta al texto cifrado,
-- cosa que el ADR permite— haría que el endpoint respondiera 200 sin insertar nada. Meta
-- no reintenta: se perderían los mensajes de todas las agencias, sin una sola excepción en
-- los registros.
CREATE OR REPLACE FUNCTION public.registrar_recepcion(
  p_recepcion_id bytea,
  p_payload_cifrado bytea,
  p_payload_nonce bytea,
  p_payload_tag bytea,
  p_clave_version smallint,
  p_total_changes smallint
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_filas integer := 0;
BEGIN
  IF p_recepcion_id IS NULL OR p_payload_cifrado IS NULL OR p_payload_nonce IS NULL
     OR p_payload_tag IS NULL OR p_clave_version IS NULL OR p_total_changes IS NULL THEN
    RAISE EXCEPTION 'registrar_recepcion: ningún argumento puede ser nulo (recibido: %, %, %, %, %, %)',
      p_recepcion_id IS NULL, p_payload_cifrado IS NULL, p_payload_nonce IS NULL,
      p_payload_tag IS NULL, p_clave_version IS NULL, p_total_changes IS NULL
      USING ERRCODE = '22023';
  END IF;

  IF p_total_changes < 1 OR p_total_changes > 1000 THEN
    RAISE EXCEPTION 'registrar_recepcion: número de changes fuera de rango (%)', p_total_changes
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.recepciones_webhook
    (recepcion_id, payload_cifrado, payload_nonce, payload_tag, clave_version)
  VALUES
    (p_recepcion_id, p_payload_cifrado, p_payload_nonce, p_payload_tag, p_clave_version)
  ON CONFLICT (recepcion_id) DO NOTHING;

  GET DIAGNOSTICS v_filas = ROW_COUNT;

  IF v_filas > 0 THEN
    INSERT INTO public.recepciones_webhook_changes (recepcion_id, indice, estado)
    SELECT p_recepcion_id, g::smallint, 'PENDIENTE'
    FROM pg_catalog.generate_series(0, p_total_changes - 1) AS g;
  END IF;

  RETURN v_filas > 0;
END;
$func$;

-- La carrera que C-3 pedía cerrar es entre dos TRANSACCIONES, no entre dos sentencias.
-- Bajo READ COMMITTED el `NOT EXISTS` se evalúa con la instantánea de la sentencia, que no
-- ve el `PROCESADO` todavía sin confirmar del otro trabajador: el predicado es falso, el
-- UPDATE no toca filas, no toma ningún bloqueo y no hay reevaluación EvalPlanQual. Los dos
-- trabajadores terminan creyendo que el otro sigue pendiente y **ninguno anula**: el
-- contenido —teléfono, texto, a veces pasaporte, de varias agencias, sin RLS— sobrevive
-- hasta la purga, treinta días en vez de minutos. Es el único plazo que decide la
-- legalidad del apartado.
--
-- El bloqueo sobre la fila padre, como PRIMERA sentencia, es lo que serializa: el segundo
-- trabajador espera a que el primero confirme y su siguiente sentencia, ya con instantánea
-- nueva, sí ve el `PROCESADO`.
CREATE OR REPLACE FUNCTION public.anular_payload(
  p_recepcion_id bytea,
  p_indice smallint,
  p_estado public.estado_change_recepcion
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_marcados integer := 0;
  v_anulados integer := 0;
BEGIN
  IF p_recepcion_id IS NULL OR p_indice IS NULL OR p_estado IS NULL THEN
    RAISE EXCEPTION 'anular_payload: ningún argumento puede ser nulo'
      USING ERRCODE = '22023';
  END IF;

  IF p_estado NOT IN ('PROCESADO', 'CLASIFICADO') THEN
    RAISE EXCEPTION 'anular_payload: estado final inválido (%)', p_estado
      USING ERRCODE = '22023';
  END IF;

  -- Serializa a los trabajadores de una misma recepción. Primera sentencia, a propósito.
  PERFORM 1 FROM public.recepciones_webhook r
   WHERE r.recepcion_id = p_recepcion_id
   FOR UPDATE;

  UPDATE public.recepciones_webhook_changes c
     SET estado = p_estado,
         procesado_en = pg_catalog.now()
   WHERE c.recepcion_id = p_recepcion_id
     AND c.indice = p_indice
     AND c.estado = 'PENDIENTE';

  GET DIAGNOSTICS v_marcados = ROW_COUNT;

  UPDATE public.recepciones_webhook r
     SET payload_cifrado = NULL,
         payload_nonce   = NULL,
         payload_tag     = NULL,
         anulado_en      = pg_catalog.now()
   WHERE r.recepcion_id = p_recepcion_id
     AND r.payload_cifrado IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.recepciones_webhook_changes p
       WHERE p.recepcion_id = p_recepcion_id AND p.estado = 'PENDIENTE'
     );

  GET DIAGNOSTICS v_anulados = ROW_COUNT;

  -- Lo que devuelve es si ESTE `change` quedó marcado, que es lo que el llamador pidió.
  -- Antes devolvía el resultado de la segunda sentencia y descartaba el de la primera: un
  -- índice inexistente contestaba `true` o `false` según una condición ajena.
  IF v_anulados > 0 THEN
    RAISE NOTICE 'Contenido de la recepción anulado: no quedan changes pendientes.';
  END IF;

  RETURN v_marcados > 0;
END;
$func$;

-- SÉPTIMA función. El contenido se anulaba solo cuando no quedaba ningún `change`
-- pendiente, y la purga se niega —con razón— a borrar una recepción con alguno pendiente,
-- porque sería destruir la evidencia del fallo. Juntas producían un tercer comportamiento
-- que nadie decidió: **un `change` que agota sus reintentos deja el contenido ahí para
-- siempre.** Datos personales de viajeros de varias agencias, en una tabla sin RLS, sin
-- responsable del tratamiento identificable para la parte no resuelta.
--
-- Esta función separa borrar CONTENIDO de borrar FILA: anula el payload de toda recepción
-- anterior a un plazo corto con independencia del estado de sus hijos, y conserva la fila,
-- el `recepcion_id` y los `changes`. El invariante de la aserción 18 queda intacto.
CREATE OR REPLACE FUNCTION public.purgar_payloads(p_anteriores_a timestamptz)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_anulados integer := 0;
BEGIN
  IF p_anteriores_a IS NULL THEN
    RAISE EXCEPTION 'purgar_payloads: el plazo no puede ser nulo' USING ERRCODE = '22023';
  END IF;

  UPDATE public.recepciones_webhook r
     SET payload_cifrado = NULL,
         payload_nonce   = NULL,
         payload_tag     = NULL,
         anulado_en      = pg_catalog.now()
   WHERE r.recibido_en < p_anteriores_a
     AND r.payload_cifrado IS NOT NULL;

  GET DIAGNOSTICS v_anulados = ROW_COUNT;
  RETURN v_anulados;
END;
$func$;

RESET ROLE;

-- `purgar_payloads` nace, como todas, con EXECUTE para PUBLIC. Y el orden de estas tres
-- líneas vuelve a ser el único que funciona: revocar y conceder ANTES de que el objeto
-- cambie de dueño. Aquí la función ya se creó bajo `SET ROLE viajapro_staging`, así que
-- el dueño es el correcto desde el principio y el REVOKE lo ejecuta su dueño.
SET ROLE viajapro_staging;
REVOKE ALL ON FUNCTION public.purgar_payloads(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purgar_payloads(timestamptz) TO viajapro_webhook;
COMMENT ON FUNCTION public.purgar_payloads(timestamptz) IS
  'Anula el contenido de recepciones antiguas aunque tengan changes sin resolver. Conserva fila y evidencia. Séptima función SECURITY DEFINER (auditoría de implementación de ADR-0008).';
RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM viajapro_enrutador, viajapro_staging;

-- -----------------------------------------------------------------------------
-- 5. Las particiones del historial, para la CLASE y no para las dos que existen
--
-- La partición de 2028 la iba a crear «trabajo programado de plataforma»: un trabajo que
-- no existía. Y si la crea el rol de migraciones, nace con `UPDATE` y `DELETE` para los
-- tres roles de login —el `ALTER DEFAULT PRIVILEGES` sigue vigente—, su dueño es el rol de
-- migraciones, así que el `REVOKE` del dueño no la alcanza, y nadie reejecuta el
-- aplicador. El 1 de enero de 2028, `UPDATE enrutamiento_historial_2028 SET tenant_nuevo =
-- '<atacante>'` reescribe la bitácora que existe para que un secuestro sea demostrable.
-- La aserción que lo vigila no lo veía: PostgreSQL comprueba privilegios sobre la tabla
-- particionada cuando se accede a través de ella, nunca sobre la partición.
--
-- Esta función es del mismo género que `aplicar_aislamiento_tenant`: la ejecuta una
-- migración o un trabajo de plataforma **con el rol de migraciones**, sin entrada de
-- usuario, y por eso puede componer SQL. No es una de las siete `SECURITY DEFINER` del
-- ADR y no entra en su inventario ni en la matriz de la aserción 20.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_particion_historial(p_anio integer)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  nombre text;
  desde  text;
  hasta  text;
BEGIN
  IF p_anio < 2026 OR p_anio > 2200 THEN
    RAISE EXCEPTION 'crear_particion_historial: año fuera de rango (%)', p_anio;
  END IF;

  nombre := 'enrutamiento_historial_' || p_anio::text;
  desde  := p_anio::text || '-01-01 00:00:00+00';
  hasta  := (p_anio + 1)::text || '-01-01 00:00:00+00';

  -- Adjuntar una partición exige ser dueño de la tabla particionada, y el dueño necesita
  -- CREATE sobre el esquema para poseer el objeto nuevo. Se concede y se retira dentro de
  -- la misma función: en reposo nadie salvo el dueño del esquema puede crear en `public`.
  EXECUTE 'GRANT CREATE ON SCHEMA public TO viajapro_enrutador';
  EXECUTE 'SET LOCAL ROLE viajapro_enrutador';

  IF to_regclass('public.' || quote_ident(nombre)) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE public.%I PARTITION OF public.enrutamiento_historial FOR VALUES FROM (%L) TO (%L)',
      nombre, desde, hasta);
    RAISE NOTICE 'Creada la partición % del historial.', nombre;
  END IF;

  -- Idempotente y, sobre todo, aplicable también a una partición que alguien haya creado
  -- a mano: propiedad al dueño del historial y la misma revocación que el padre.
  EXECUTE format('ALTER TABLE public.%I OWNER TO viajapro_enrutador', nombre);
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON public.%I FROM viajapro_enrutador', nombre);

  EXECUTE 'RESET ROLE';
  EXECUTE 'REVOKE CREATE ON SCHEMA public FROM viajapro_enrutador';

  -- Y los roles de login: la partición acaba de nacer con los privilegios que el
  -- `ALTER DEFAULT PRIVILEGES` concede, y este es el único mecanismo que los retira.
  PERFORM aplicar_privilegios_declarados();
END;
$$;

COMMENT ON FUNCTION crear_particion_historial(integer) IS
  'Crea (o repara) la partición anual del historial con su propietario y sus privilegios. La ejecuta el trabajo anual de plataforma con el rol de migraciones.';

REVOKE ALL ON FUNCTION crear_particion_historial(integer) FROM PUBLIC;

-- Tres años por delante, y de paso la función queda ejercitada en todos los entornos
-- —incluido CI y la base efímera de la aserción 23—, que es lo que hace que la aserción
-- de particiones pruebe algo.
SELECT crear_particion_historial(2028);
SELECT crear_particion_historial(2029);
SELECT crear_particion_historial(2030);

-- Y las dos que ya existían pasan por la misma función, para que su estado no dependa de
-- cómo se crearon.
SELECT crear_particion_historial(2026);
SELECT crear_particion_historial(2027);
