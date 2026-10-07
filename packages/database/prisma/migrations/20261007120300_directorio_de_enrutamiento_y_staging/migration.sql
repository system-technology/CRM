-- =============================================================================
-- ADR-0008 — Directorio de enrutamiento y staging de webhooks
--
-- El problema que resuelve, en una frase: **para saber de qué agencia es el webhook hay
-- que leer una tabla, y si esa tabla está protegida por tenant, hay que saber la agencia
-- para leerla.** Huevo y gallina. Meta manda todos los webhooks de todas las agencias a
-- un solo endpoint y no sabe nada de nuestros tenants.
--
-- Esta migración crea las CUATRO tablas globales (`excepciones_rls` se crea en la
-- migración de políticas, que es su sitio: es el mecanismo, no el directorio), las SEIS
-- funciones `SECURITY DEFINER` y los permisos que separan los cinco roles.
--
-- Lo que hay que leer antes de tocar nada de aquí:
--   docs/03-adr/0008-resolucion-de-tenant-en-webhooks-entrantes.md
--   docs/_auditorias/2026-10-07-adr-0008-aislamiento-en-webhooks.md
--
-- NO ES REVERSIBLE sin pérdida: si se revierte, se pierde el mapa de enrutamiento y los
-- eventos en vuelo del staging. Plan de reversión: reconstruir el directorio desde
-- `canales` y `cuentas_whatsapp` —es derivado, esa es la verdad— con el trabajo de
-- plataforma de rotación de pimienta; los eventos no procesados se recuperan de Meta solo
-- si no se les devolvió 200, así que la reversión se hace con el endpoint apagado.
-- =============================================================================

-- CreateEnum
CREATE TYPE "estado_enrutamiento" AS ENUM ('ACTIVO', 'SUSPENDIDO', 'REVOCADO');

-- CreateEnum
CREATE TYPE "estado_change_recepcion" AS ENUM ('PENDIENTE', 'PROCESADO', 'CLASIFICADO');

-- -----------------------------------------------------------------------------
-- 1. El directorio
--
-- Cuatro columnas de ruteo y la versión de pimienta. NADA más: ni tokens, ni nombres, ni
-- fechas. Las fechas se fueron a `canales` porque aquí eran el libro de clientes servido
-- a quien pudiera leer la tabla, y el WABA cifrado se fue porque el único camino que lo
-- necesita en claro conoce el tenant y puede leerlo de `canales`, que es la verdad.
--
-- Ninguna columna se llama `tenant_id`, y eso NO es cosmético: el aplicador de políticas
-- es dirigido por datos y le pondría RLS automáticamente, devolviendo el ciclo
-- huevo-gallina sin producir ningún error. El nombre incómodo es la señal de que esta
-- tabla NO está aislada y de que nadie debe asumir que lo está. Aserción 17.
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "enrutamiento_canales" (
    "clave_canal_hmac" BYTEA NOT NULL,
    "tenant_resuelto_id" UUID NOT NULL,
    "canal_id" UUID,
    "estado" "estado_enrutamiento" NOT NULL,
    "pimienta_version" SMALLINT NOT NULL,

    CONSTRAINT "enrutamiento_canales_pkey" PRIMARY KEY ("clave_canal_hmac")
);

COMMENT ON TABLE enrutamiento_canales IS
  'Mapa identificador de Meta -> tenant. Clave en HMAC-SHA256 con pimienta FUERA de la base: un volcado no revela ni un solo identificador. ADR-0008 §1.1.';
COMMENT ON COLUMN enrutamiento_canales.clave_canal_hmac IS
  'HMAC-SHA256(pimienta, ''pn:''||phone_number_id) o (''waba:''||waba_id). El tipo va DENTRO del mensaje: separa dominios sin columna de tipo y hace imposible la colisión entre un id de número y uno de cuenta.';
COMMENT ON COLUMN enrutamiento_canales.canal_id IS
  'Nulo en las filas de tipo WABA: un evento de gestión apunta a la cuenta, no a un número.';
COMMENT ON COLUMN enrutamiento_canales.pimienta_version IS
  'Con qué pimienta se calculó la clave. Durante una rotación es lo único que distingue lo reconstruido de lo que falta.';

-- -----------------------------------------------------------------------------
-- 2. El historial: que un secuestro sea detectable y demostrable
--
-- `registros_auditoria` NO sirve para esto: tiene tenant_id y RLS forzada, así que el
-- registro del ataque quedaría archivado bajo el ATACANTE y la víctima no podría verlo
-- nunca.
--
-- Particionada por año porque su retención son 5 años y **nadie tiene DELETE sobre ella**
-- —es lo que la hace probatoria—, de modo que una retención por filas sería literalmente
-- inaplicable: no hay rol que pueda ejecutarla. Soltar una partición no es un DELETE
-- sobre filas: el invariante de inmutabilidad se conserva intacto y el plazo pasa a ser
-- ejecutable.
--
-- Se indexa por `canal_id` y `cuenta_id`, NUNCA por el HMAC: ninguna tabla probatoria se
-- indexa por un valor derivado de un secreto rotable, o la primera rotación deja la
-- historia inconsultable para siempre. Y hacen falta los dos identificadores porque
-- `canal_id` es nulo justo en las filas que gobiernan los eventos de gestión.
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "enrutamiento_historial" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "canal_id" UUID,
    "cuenta_id" UUID,
    "clave_canal_hmac" BYTEA NOT NULL,
    "pimienta_version" SMALLINT NOT NULL,
    "tenant_anterior" UUID,
    "tenant_nuevo" UUID NOT NULL,
    "estado_anterior" "estado_enrutamiento",
    "estado_nuevo" "estado_enrutamiento" NOT NULL,
    "actor_usuario_id" UUID,
    "actor_tenant_id" UUID,
    "motivo" VARCHAR(200) NOT NULL,
    "ocurrido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrutamiento_historial_pkey" PRIMARY KEY ("id","ocurrido_en"),
    -- Uno de los dos, no nulo. Sin esta restricción, las filas WABA quedarían sin
    -- identificador estable y solo consultables por el HMAC, que es lo que se evita.
    CONSTRAINT "enrutamiento_historial_identificable" CHECK ("canal_id" IS NOT NULL OR "cuenta_id" IS NOT NULL)
) PARTITION BY RANGE ("ocurrido_en");

-- Particiones anuales. Crear la del año siguiente es trabajo programado de plataforma:
-- si falta, las escrituras fallan, que es ruidoso y preferible a una partición por
-- defecto que luego impide adjuntar el año nuevo sin mover filas.
CREATE TABLE "enrutamiento_historial_2026" PARTITION OF "enrutamiento_historial"
  FOR VALUES FROM ('2026-01-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE "enrutamiento_historial_2027" PARTITION OF "enrutamiento_historial"
  FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2028-01-01 00:00:00+00');

-- CreateIndex
CREATE INDEX "enrutamiento_historial_canal_id_ocurrido_en_idx" ON "enrutamiento_historial"("canal_id", "ocurrido_en" DESC);

-- CreateIndex
CREATE INDEX "enrutamiento_historial_cuenta_id_ocurrido_en_idx" ON "enrutamiento_historial"("cuenta_id", "ocurrido_en" DESC);

-- CreateIndex
CREATE INDEX "enrutamiento_historial_tenant_nuevo_ocurrido_en_idx" ON "enrutamiento_historial"("tenant_nuevo", "ocurrido_en" DESC);

COMMENT ON TABLE enrutamiento_historial IS
  'Solo inserción. Ningún rol tiene UPDATE ni DELETE, ni siquiera su propietario: aserción 24. Retención 5 años por particiones anuales.';

-- -----------------------------------------------------------------------------
-- 3. El staging: ningún 200 sin durabilidad
--
-- No se devuelve 200 antes de que el evento esté en una tabla durable. Encolar a secas no
-- lo cumple: Redis no es un almacén transaccional y una pérdida ahí es un mensaje de
-- cliente que ningún asesor verá jamás.
--
-- El contenido va cifrado desde el proceso de Node —nunca con pgcrypto pasando la clave
-- dentro del SQL, que acabaría en pg_stat_statements y en los registros del proveedor— y
-- vive MINUTOS: se anula al procesar o al clasificar. Es el único plazo que decide la
-- legalidad de todo el apartado, porque ahí están el teléfono del viajero, el texto y a
-- veces un número de pasaporte.
-- -----------------------------------------------------------------------------

-- CreateTable
CREATE TABLE "recepciones_webhook" (
    "recepcion_id" BYTEA NOT NULL,
    "payload_cifrado" BYTEA,
    "payload_nonce" BYTEA,
    "payload_tag" BYTEA,
    "clave_version" SMALLINT NOT NULL,
    "recibido_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anulado_en" TIMESTAMPTZ(3),

    CONSTRAINT "recepciones_webhook_pkey" PRIMARY KEY ("recepcion_id")
);

-- CreateTable
CREATE TABLE "recepciones_webhook_changes" (
    "recepcion_id" BYTEA NOT NULL,
    "indice" SMALLINT NOT NULL,
    "estado" "estado_change_recepcion" NOT NULL DEFAULT 'PENDIENTE',
    "procesado_en" TIMESTAMPTZ(3),

    CONSTRAINT "recepciones_webhook_changes_pkey" PRIMARY KEY ("recepcion_id","indice")
);

-- CreateIndex
CREATE INDEX "recepciones_webhook_recibido_en_idx" ON "recepciones_webhook"("recibido_en");

-- CreateIndex
CREATE INDEX "recepciones_webhook_changes_procesado_en_idx" ON "recepciones_webhook_changes"("procesado_en");

-- AddForeignKey
ALTER TABLE "recepciones_webhook_changes" ADD CONSTRAINT "recepciones_webhook_changes_recepcion_id_fkey" FOREIGN KEY ("recepcion_id") REFERENCES "recepciones_webhook"("recepcion_id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMENT ON TABLE recepciones_webhook IS
  'Staging del webhook. Contenido cifrado con AAD = recepcion_id, nonce y versión de clave por fila. Vive minutos.';
COMMENT ON TABLE recepciones_webhook_changes IS
  'El grano real del procesamiento es el change, no el POST: un POST puede traer varios changes de WABAs distintos. ADR-0008 §4 y RV-1.';

-- -----------------------------------------------------------------------------
-- 4. La clave foránea COMPUESTA del directorio
--
-- `canal_id` y `tenant_resuelto_id` son campos independientes y nada obliga a que
-- concuerden; `registrar_enrutamiento`, que por diseño no tiene privilegios sobre
-- `canales`, tampoco puede comprobarlo. Lo impone el motor. Escrita simple en vez de
-- compuesta sigue funcionando y nadie lo nota hasta que una fila cruza tenants.
-- Aserción 25.
-- -----------------------------------------------------------------------------

-- AddForeignKey
ALTER TABLE "enrutamiento_canales" ADD CONSTRAINT "enrutamiento_canales_canal_id_tenant_resuelto_id_fkey" FOREIGN KEY ("canal_id", "tenant_resuelto_id") REFERENCES "canales"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- CreateIndex
CREATE INDEX "enrutamiento_canales_tenant_resuelto_id_idx" ON "enrutamiento_canales"("tenant_resuelto_id");

-- -----------------------------------------------------------------------------
-- 5. Declarar las excepciones ANTES de tocar privilegios
--
-- `001` aplica literalmente lo que diga esta tabla. Si estas filas no estuvieran, las
-- cuatro tablas globales quedarían con los privilegios que `ALTER DEFAULT PRIVILEGES`
-- acaba de concederles a los tres roles de aplicación al crearlas — que es exactamente
-- el agujero.
-- -----------------------------------------------------------------------------
INSERT INTO excepciones_rls (tabla, rol, privilegios, motivo)
SELECT t.tabla, r.rol, '{}'::text[], t.motivo
FROM (VALUES
  ('enrutamiento_canales',        'Directorio de ruteo sin aislamiento por tenant: es lo que rompe el ciclo huevo-gallina del webhook entrante. Quien pueda ESCRIBIRLO desvía las conversaciones de una agencia a otra; quien pueda LEERLO obtiene la lista de objetivos del token de plataforma. Ningún rol de login tiene un solo privilegio: se llega por resolver_enrutamiento y registrar_enrutamiento. ADR-0008 §1.1.'),
  ('enrutamiento_historial',      'Bitácora global del directorio. Es global porque registros_auditoria tiene RLS y archivaría el ataque bajo el atacante, invisible para la víctima. Solo inserción, y ni su propietario puede modificarla. ADR-0008 §1.6.'),
  ('recepciones_webhook',         'Staging del webhook: contenido de varios tenants durante segundos, antes de saber de quién es. Cifrado, acotado por funciones y borrado al clasificar. Ningún rol de login lo toca directamente. ADR-0008 §4.'),
  ('recepciones_webhook_changes', 'Tabla hija del staging: el estado de proceso por change. Misma disciplina y mismo propietario que su tabla padre. ADR-0008 §4.')
) AS t(tabla, motivo)
CROSS JOIN (VALUES ('viajapro_app'), ('viajapro_altas'), ('viajapro_webhook')) AS r(rol)
ON CONFLICT (tabla, rol) DO UPDATE
  SET privilegios = EXCLUDED.privilegios,
      motivo      = EXCLUDED.motivo;

-- -----------------------------------------------------------------------------
-- 6. Los propietarios
--
-- DOS propietarios y no uno. `viajapro_app` sí puede ejecutar `registrar_recepcion`, y si
-- esa función perteneciera al dueño del directorio, su usuario efectivo tendría todos los
-- privilegios sobre `enrutamiento_canales`. Hoy su cuerpo solo inserta y el control sería
-- "toda ampliación pasa por revisión" — una revisión humana, justo lo que este ADR no
-- acepta como protección. Con propietarios separados, aunque alguien amplíe el cuerpo
-- dentro de seis meses, la función NO ALCANZA el directorio.
--
-- Para poseer un objeto en un esquema hace falta CREATE sobre él. Se concede, se
-- traspasa la propiedad y se revoca: al terminar esta migración ningún rol salvo el
-- propietario del esquema puede crear nada en `public`.
-- -----------------------------------------------------------------------------
GRANT CREATE ON SCHEMA public TO viajapro_enrutador, viajapro_staging;

ALTER TABLE "enrutamiento_canales"           OWNER TO viajapro_enrutador;
ALTER TABLE "enrutamiento_historial"         OWNER TO viajapro_enrutador;
ALTER TABLE "enrutamiento_historial_2026"    OWNER TO viajapro_enrutador;
ALTER TABLE "enrutamiento_historial_2027"    OWNER TO viajapro_enrutador;
ALTER TABLE "recepciones_webhook"            OWNER TO viajapro_staging;
ALTER TABLE "recepciones_webhook_changes"    OWNER TO viajapro_staging;

-- -----------------------------------------------------------------------------
-- 7. Las seis funciones SECURITY DEFINER
--
-- `SECURITY DEFINER` sin más es una vulnerabilidad conocida. Las cuatro reglas que las
-- cuatro cumplen, y que son parte de la decisión y no del detalle de implementación:
--
--   1. `search_path` VACÍO, con todos los objetos cualificados (`public.x`,
--      `pg_catalog.now()`). Decir "search_path fijado" admite implementaciones inseguras:
--      fijarlo a `public` sigue siendo vulnerable si alguien puede crear objetos ahí. El
--      vacío con cualificación es la única variante que no depende de quién puede crear qué.
--   2. **Prohibido el SQL dinámico aquí dentro.** Una función SECURITY DEFINER que compone
--      SQL con un parámetro es una inyección con privilegios ajenos. El proyecto usa ese
--      patrón en `aplicar_aislamiento_tenant`: ahí es aceptable porque lo ejecuta una
--      migración, con el rol propietario y sin entrada de usuario; aquí no lo es.
--   3. Volatilidad declarada. `STRICT` donde aplica, para no razonar sobre la entrada nula.
--   4. El `REVOKE ... FROM PUBLIC` va INMEDIATAMENTE después de cada `CREATE FUNCTION`, y
--      **antes del `ALTER FUNCTION ... OWNER TO`**. PostgreSQL concede EXECUTE a PUBLIC por
--      omisión, sin que nadie escriba un GRANT; y si el traspaso de propiedad se hace
--      primero, el REVOKE del rol de migraciones deja de ser el concedente y se convierte
--      en un no-op con un simple AVISO: la función queda ejecutable por todo el mundo y la
--      migración termina en verde. Aserción 12.
--
-- Toda modificación del cuerpo de cualquiera de las seis vuelve a pasar por auditoría de
-- seguridad, igual que una política RLS.
-- -----------------------------------------------------------------------------

-- 7.1 Resolver: el camino caliente. Una fila por llamada, por su clave exacta.
--
-- Devolver una fila por llamada impide un VOLCADO, no una enumeración: la función ES un
-- oráculo de pertenencia a la plataforma y lo honesto es escribirlo. Lo que cambia es el
-- costo. Dos cosas lo acotan: con la clave en HMAC hay que tener la pimienta para
-- preguntar —lo que lo cierra para quien no esté ya dentro del proceso— y lo que quede se
-- vigila con la métrica de resoluciones fallidas por minuto, con alerta.
--
-- Acepta la clave venga de la pimienta que venga: durante una rotación el trabajador
-- pregunta con la actual y, si no hay fila, con la anterior. La ventana de dos pimientas
-- vive en el llamador porque la pimienta NUNCA entra en la base.
CREATE FUNCTION public.resolver_enrutamiento(p_clave bytea)
RETURNS TABLE (
  tenant_resuelto_id uuid,
  canal_id uuid,
  estado public.estado_enrutamiento,
  pimienta_version smallint
)
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $func$
  SELECT e.tenant_resuelto_id, e.canal_id, e.estado, e.pimienta_version
  FROM public.enrutamiento_canales e
  WHERE e.clave_canal_hmac = p_clave;
$func$;

-- El orden de estas cuatro líneas es el único que funciona, y PostgreSQL no avisa de lo
-- contrario: tras `ALTER FUNCTION ... OWNER TO`, el rol de migraciones deja de ser el
-- concedente, su REVOKE pasa a ser un no-op con un simple AVISO y su GRANT falla con
-- 42501. Revocar y conceder ANTES; traspasar la propiedad al final.
REVOKE ALL ON FUNCTION public.resolver_enrutamiento(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_enrutamiento(bytea) TO viajapro_webhook;
COMMENT ON FUNCTION public.resolver_enrutamiento(bytea) IS
  'Resuelve el tenant de una clave de ruteo. SOLO la invoca el trabajador de webhooks: ninguna ruta HTTP la alcanza con entrada de usuario.';
ALTER FUNCTION public.resolver_enrutamiento(bytea) OWNER TO viajapro_enrutador;

-- 7.2 Registrar: la peor primitiva del sistema después de BYPASSRLS.
--
-- Quien pueda ejecutarla puede repuntar el número de una agencia hacia otro tenant y
-- desviarle las conversaciones completas. Por eso el EXECUTE lo tiene ÚNICAMENTE
-- `viajapro_altas`, que es el rol de un solo endpoint.
--
-- La comprobación de `app.current_tenant` de aquí dentro es una comprobación de
-- CONSISTENCIA, no una frontera de seguridad: ese GUC lo fija el propio rol con
-- set_config, sin ninguna restricción, y una función SECURITY DEFINER no puede distinguir
-- un GUC puesto por un token de sesión verificado de uno puesto por una inyección SQL.
-- **La frontera es el EXECUTE.**
--
-- Los identificadores de Meta con los que se la invoca JAMÁS vienen del cliente: salen de
-- la respuesta de Meta al canje del `code` del Embedded Signup, que es la prueba de
-- titularidad. Eso no lo puede imponer el esquema; lo verifica la prueba de extremo a
-- extremo del alta (§5 del ADR, dueño `qa`).
CREATE FUNCTION public.registrar_enrutamiento(
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
BEGIN
  IF p_clave IS NULL OR p_pimienta_version IS NULL OR p_tenant IS NULL
     OR p_estado IS NULL OR p_motivo IS NULL THEN
    RAISE EXCEPTION 'registrar_enrutamiento: faltan argumentos obligatorios'
      USING ERRCODE = '22023';
  END IF;

  -- El historial necesita un identificador propio y estable, y `canal_id` es nulo en las
  -- filas WABA. Si no viene ninguno de los dos, la fila nacería inconsultable tras la
  -- primera rotación de pimienta.
  IF p_canal_id IS NULL AND p_cuenta_id IS NULL THEN
    RAISE EXCEPTION 'registrar_enrutamiento: hace falta canal_id o cuenta_id'
      USING ERRCODE = '22023';
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

  -- Reclamar la clave de otro tenant se rechaza y es una SEÑAL, no un error de usuario.
  -- Excepción: una fila REVOCADO puede reasignarse —un número que Meta devolvió al mercado
  -- y asignó a otra agencia—, siempre con la prueba de titularidad del canje detrás. Sin
  -- esa salida, "la fila no se borra nunca" se convierte en una denegación de servicio:
  -- bastaría registrar los identificadores de veinte competidores.
  IF v_existe AND v_tenant_previo IS DISTINCT FROM p_tenant AND v_estado_previo <> 'REVOCADO' THEN
    RAISE EXCEPTION 'registrar_enrutamiento: la clave pertenece a otro tenant'
      USING ERRCODE = '42501';
  END IF;

  -- Invariante del ADR: la fila WABA y todas las filas de número de ese WABA apuntan al
  -- mismo tenant. La función no tiene —ni debe tener— privilegios sobre `canales`, así que
  -- lo comprueba contra el último asiento del historial de esa cuenta, que sí es suyo.
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
    (clave_canal_hmac, tenant_resuelto_id, canal_id, estado, pimienta_version)
  VALUES (p_clave, p_tenant, p_canal_id, p_estado, p_pimienta_version)
  ON CONFLICT (clave_canal_hmac) DO UPDATE
    SET tenant_resuelto_id = EXCLUDED.tenant_resuelto_id,
        canal_id           = EXCLUDED.canal_id,
        estado             = EXCLUDED.estado,
        pimienta_version   = EXCLUDED.pimienta_version;

  -- En la MISMA transacción. Un cambio de titularidad que no quedara escrito aquí sería
  -- un secuestro indetectable e indemostrable.
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

REVOKE ALL ON FUNCTION public.registrar_enrutamiento(bytea, smallint, uuid, uuid, uuid, public.estado_enrutamiento, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_enrutamiento(bytea, smallint, uuid, uuid, uuid, public.estado_enrutamiento, uuid, text) TO viajapro_altas;
COMMENT ON FUNCTION public.registrar_enrutamiento(bytea, smallint, uuid, uuid, uuid, public.estado_enrutamiento, uuid, text) IS
  'Alta y repunte del directorio, con asiento obligatorio en el historial. EXECUTE solo para viajapro_altas: la frontera es el rol de conexión.';
ALTER FUNCTION public.registrar_enrutamiento(bytea, smallint, uuid, uuid, uuid, public.estado_enrutamiento, uuid, text) OWNER TO viajapro_enrutador;

-- 7.3 Staging. Propietario `viajapro_staging`, SIN ningún privilegio sobre el directorio.

-- Inserta la recepción y una fila hija por `change`. Devuelve si la fila era nueva, que es
-- lo que distingue un reintento de Meta de un evento nuevo.
CREATE FUNCTION public.registrar_recepcion(
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
STRICT
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_filas integer := 0;
BEGIN
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
    -- El índice es el orden aplanado sobre entry[].changes[], definido de una vez: dos
    -- convenciones distintas producirían identificadores de trabajo distintos para el
    -- mismo reintento, y la idempotencia dejaría de existir sin que nada fallara.
    INSERT INTO public.recepciones_webhook_changes (recepcion_id, indice, estado)
    SELECT p_recepcion_id, g::smallint, 'PENDIENTE'
    FROM pg_catalog.generate_series(0, p_total_changes - 1) AS g;
  END IF;

  RETURN v_filas > 0;
END;
$func$;

REVOKE ALL ON FUNCTION public.registrar_recepcion(bytea, bytea, bytea, bytea, smallint, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_recepcion(bytea, bytea, bytea, bytea, smallint, smallint) TO viajapro_app;
ALTER FUNCTION public.registrar_recepcion(bytea, bytea, bytea, bytea, smallint, smallint) OWNER TO viajapro_staging;

-- UN `change` por su identificador exacto: un barrido masivo deja de existir como
-- operación. El que puede listar no es el que puede descifrar — la clave vive en el
-- proceso del trabajador, no en la API.
CREATE FUNCTION public.tomar_recepcion(p_recepcion_id bytea, p_indice smallint)
RETURNS TABLE (
  payload_cifrado bytea,
  payload_nonce bytea,
  payload_tag bytea,
  clave_version smallint,
  estado public.estado_change_recepcion,
  recibido_en timestamptz
)
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $func$
  SELECT r.payload_cifrado, r.payload_nonce, r.payload_tag, r.clave_version,
         c.estado, r.recibido_en
  FROM public.recepciones_webhook r
  JOIN public.recepciones_webhook_changes c
    ON c.recepcion_id = r.recepcion_id
  WHERE r.recepcion_id = p_recepcion_id
    AND c.indice = p_indice;
$func$;

REVOKE ALL ON FUNCTION public.tomar_recepcion(bytea, smallint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tomar_recepcion(bytea, smallint) TO viajapro_webhook;
ALTER FUNCTION public.tomar_recepcion(bytea, smallint) OWNER TO viajapro_staging;

-- Marca el `change` como resuelto y anula el contenido cuando ya no queda ninguno
-- pendiente de esa recepción. Se invoca INCONDICIONALMENTE tras cada change.
--
-- La condición "¿era el último?" se resuelve DENTRO de una sola sentencia, nunca
-- comprobando y decidiendo en el trabajador: dos trabajadores que terminen los dos últimos
-- a la vez pueden verse mutuamente como pendientes y no anularlo NUNCA, dejando el
-- contenido hasta la purga en vez de minutos. Es el único plazo que decide la legalidad
-- del apartado, así que no puede depender de una carrera.
CREATE FUNCTION public.anular_payload(
  p_recepcion_id bytea,
  p_indice smallint,
  p_estado public.estado_change_recepcion
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_filas integer := 0;
BEGIN
  IF p_estado NOT IN ('PROCESADO', 'CLASIFICADO') THEN
    RAISE EXCEPTION 'anular_payload: estado final inválido (%)', p_estado
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.recepciones_webhook_changes c
     SET estado = p_estado,
         procesado_en = pg_catalog.now()
   WHERE c.recepcion_id = p_recepcion_id
     AND c.indice = p_indice
     AND c.estado = 'PENDIENTE';

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

  GET DIAGNOSTICS v_filas = ROW_COUNT;
  RETURN v_filas > 0;
END;
$func$;

REVOKE ALL ON FUNCTION public.anular_payload(bytea, smallint, public.estado_change_recepcion) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anular_payload(bytea, smallint, public.estado_change_recepcion) TO viajapro_webhook;
ALTER FUNCTION public.anular_payload(bytea, smallint, public.estado_change_recepcion) OWNER TO viajapro_staging;

-- Acotada por antigüedad, nunca con filtro libre. Y NUNCA borra una recepción con algún
-- change sin resolver: borrar un evento no procesado es destruir la evidencia del fallo.
-- Aserción 18.
CREATE FUNCTION public.purgar_recepciones(p_anteriores_a timestamptz)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
STRICT
SECURITY DEFINER
SET search_path = ''
AS $func$
DECLARE
  v_borradas integer;
BEGIN
  DELETE FROM public.recepciones_webhook r
  WHERE r.recibido_en < p_anteriores_a
    AND NOT EXISTS (
      SELECT 1 FROM public.recepciones_webhook_changes c
      WHERE c.recepcion_id = r.recepcion_id AND c.estado = 'PENDIENTE'
    );

  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$func$;

REVOKE ALL ON FUNCTION public.purgar_recepciones(timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purgar_recepciones(timestamptz) TO viajapro_webhook;
ALTER FUNCTION public.purgar_recepciones(timestamptz) OWNER TO viajapro_staging;

-- -----------------------------------------------------------------------------
-- 8. El historial no lo edita NADIE, ni su propietario
--
-- Un GRANT sobrante lo haría editable y el valor probatorio desaparecería sin ninguna
-- señal. Hay que revocar PONIÉNDOSE el rol del dueño: los privilegios implícitos del
-- propietario los concede él mismo, y un REVOKE ejecutado por otro rol es un no-op con un
-- simple AVISO. La retención a 5 años no necesita DELETE: suelta particiones. Aserción 24.
-- -----------------------------------------------------------------------------
SET ROLE viajapro_enrutador;
REVOKE UPDATE, DELETE, TRUNCATE ON public.enrutamiento_historial FROM viajapro_enrutador;
REVOKE UPDATE, DELETE, TRUNCATE ON public.enrutamiento_historial_2026 FROM viajapro_enrutador;
REVOKE UPDATE, DELETE, TRUNCATE ON public.enrutamiento_historial_2027 FROM viajapro_enrutador;
RESET ROLE;

-- -----------------------------------------------------------------------------
-- 9. Cerrar: ya no hace falta CREATE en el esquema, y los privilegios se reaplican por
-- el único mecanismo que los gobierna. Esta llamada es la que retira a los tres roles de
-- login el SELECT/INSERT/UPDATE/DELETE que `ALTER DEFAULT PRIVILEGES` les concedió sobre
-- estas cuatro tablas en el instante mismo de crearlas.
-- -----------------------------------------------------------------------------
REVOKE CREATE ON SCHEMA public FROM viajapro_enrutador, viajapro_staging;

SELECT aplicar_privilegios_declarados();
