-- =============================================================================
-- Tarea 4f — un canal REVOCADO en `canales` ya no se resuelve como ACTIVO
--
-- El defecto: `enrutamiento_canales.estado` solo lo escribía `registrar_enrutamiento`, y
-- dar de baja un canal es un UPDATE sobre `canales`. Nada llevaba el cambio al directorio,
-- así que `resolver_enrutamiento` seguía contestando ACTIVO y el trabajador habría
-- persistido mensajes de una agencia sin contrato (ADR-0008 §2: sin contrato no hay
-- finalidad, Ley 1581).
--
-- Por qué un disparador y no que el resolvedor consulte `canales` (la opción preferida):
-- el resolvedor corre SIN contexto de tenant —es justo lo que resuelve— y su propietario,
-- `viajapro_enrutador`, no tiene por diseño ningún privilegio sobre `canales` (ADR-0008
-- §1.1 y §1.3). Leer `canales` desde ahí exigiría darle al dueño del directorio una lectura
-- ENTRE TENANTS sobre una tabla con RLS forzada: una excepción nueva al aislamiento para
-- arreglar un defecto de estado. El disparador no necesita ningún privilegio sobre
-- `canales`: recibe la fila en NEW, y solo escribe en las tablas que su propietario ya posee.
--
-- La regla, MONÓTONA: el directorio queda al menos tan restringido como el canal
-- (ACTIVO < SUSPENDIDO < REVOCADO, el orden de declaración del enum). Nunca relaja. Si
-- relajara, cualquier `viajapro_app` con UPDATE sobre su `canales` podría reactivar el ruteo
-- de un número, y repuntar o reactivar el directorio es la peor primitiva del sistema: queda
-- solo en `registrar_enrutamiento`, con su asiento y su rol de un solo endpoint.
--
-- El alcance de la escritura lo acotan dos columnas de la propia fila — `canal_id = NEW.id`
-- y `tenant_resuelto_id = NEW.tenant_id` —, y la RLS de `canales` decide qué filas puede
-- actualizar quien dispara: una agencia solo puede restringir el ruteo de SUS canales.
--
-- REVERSIBLE: `DROP TRIGGER canales_propagar_estado ON canales; DROP FUNCTION
-- public.propagar_estado_canal();`. Las filas del directorio que esta migración restringe y
-- sus asientos en el historial se quedan, y es lo correcto: reflejan la verdad de `canales`.
-- =============================================================================

CREATE FUNCTION public.propagar_estado_canal()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_estado public.estado_enrutamiento := NEW.estado::text::public.estado_enrutamiento;
  v_fila   record;
BEGIN
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

    -- En la misma transacción, como todo cambio del directorio. Sin titularidad nueva:
    -- tenant anterior y nuevo son el mismo, solo cambia el estado.
    INSERT INTO public.enrutamiento_historial
      (canal_id, cuenta_id, clave_canal_hmac, pimienta_version,
       tenant_anterior, tenant_nuevo, estado_anterior, estado_nuevo,
       actor_usuario_id, actor_tenant_id, motivo)
    VALUES
      (NEW.id, NULL, v_fila.clave_canal_hmac, v_fila.pimienta_version,
       NEW.tenant_id, NEW.tenant_id, v_fila.estado, v_estado,
       NEW.actualizado_por, NEW.tenant_id, 'propagado desde canales.estado');
  END LOOP;

  RETURN NULL;
END;
$func$;

-- Mismo orden que las otras siete: REVOKE antes de traspasar la propiedad, o el REVOKE es
-- un no-op con AVISO. Ningún rol recibe EXECUTE: una función de disparador no se puede
-- invocar directamente y PostgreSQL no comprueba EXECUTE al dispararla, solo al crear el
-- disparador (lo crea aquí el rol de migraciones, que aún es su propietario).
REVOKE ALL ON FUNCTION public.propagar_estado_canal() FROM PUBLIC;
COMMENT ON FUNCTION public.propagar_estado_canal() IS
  'Lleva al directorio la restricción de estado de un canal (SUSPENDIDO/REVOCADO). Monótona: nunca relaja. Tarea 4f.';

CREATE TRIGGER canales_propagar_estado
  AFTER UPDATE OF estado ON public.canales
  FOR EACH ROW
  WHEN (NEW.estado <> 'ACTIVO')
  EXECUTE FUNCTION public.propagar_estado_canal();

-- Poseer un objeto en `public` exige CREATE sobre el esquema: se concede, se traspasa y se
-- retira en el acto, igual que en la migración del directorio. Aserción 21.
GRANT CREATE ON SCHEMA public TO viajapro_enrutador;
ALTER FUNCTION public.propagar_estado_canal() OWNER TO viajapro_enrutador;
REVOKE CREATE ON SCHEMA public FROM viajapro_enrutador;

-- Reconciliar lo que ya hubiera divergido antes de este disparador. Se hace disparándolo,
-- no con un UPDATE directo al directorio: el rol de migraciones no lo posee, y así queda
-- el mismo asiento en el historial que en el camino normal. `canales` es pequeña y el
-- UPDATE solo toma bloqueos de fila.
UPDATE public.canales SET estado = estado WHERE estado <> 'ACTIVO';
