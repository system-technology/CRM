# 2026-10-19 — El relay por change y el trabajador del inbox

Rama `feat/inbox-relay`, desde `feat/inbox-webhook-post` (78e74cc). ADR-0008 §4, paso 5 y lado asíncrono.

## Qué quedó

- **POST -> cola.** `RegistrarRecepcion` encola un trabajo por change DESPUÉS de que la fila es
  durable, con `jobId = <recepcion_id hex>-<índice>`. Encola también cuando la recepción ya existía:
  el reintento de Meta cierra el hueco «guardó pero no encoló». Si Redis falla, el error sube (500).
- **`ProcesarChange`** (caso de uso, idempotente): toma el change, abre el payload, verifica
  sha256 == recepcion_id, resuelve el tenant con `resolver_enrutamiento` (ventana de dos pimientas),
  escribe contacto/conversación/mensaje/outbox en UNA transacción bajo RLS y cierra con
  `anular_payload`. Desconocido y REVOCADO se clasifican y descartan sin filas de negocio;
  desconocido durante una reconstrucción RETIENE. SUSPENDIDO se persiste.
- **Rol `viajapro_webhook`** con su propio `PrismaWebhookService` (guardia de identidad al arrancar,
  sin respaldo a otra cadena) y `conTenantResuelto`, que relee `app.current_tenant` y lo compara.
- **Consumidor BullMQ** y proceso `pnpm --filter @viajapro/api worker` (`src/worker.ts`).

## Decisiones, para revisar

- **El trabajador vive en `apps/api`, no en `apps/worker`.** El caso de uso, el dominio puro
  (`payload-sellado`, `contenido-del-cambio`) y los adaptadores ya están en el módulo `inbox`;
  moverlos a otra app exige extraer paquetes (estructural: ADR). El proceso es distinto y con su rol
  propio (`InboxWorkerModule` no comparte `PrismaService` con la API). `apps/worker` sigue vacío.
- **`jobId` con `-` y no `:`** como dice el ADR: BullMQ rechaza `:` en identificadores propios.
- **Dependencias nuevas:** `bullmq` e `ioredis` (cola, ADR-0001; BullMQ 6 exige ioredis aparte y en
  ESM el cliente ya construido) y `pg` + `@types/pg` como devDependency de `apps/api` (la e2e
  siembra y limpia con el rol propietario, igual que `aislamiento.spec.ts`).
- **Tarea 4f.** No se toca el directorio. El trabajador contrasta con `canales.estado` (la verdad)
  dentro de la transacción de escritura y, si es REVOCADO, descarta. La e2e deja el directorio en
  ACTIVO y marca el canal REVOCADO: pasa hoy y seguirá pasando cuando la migración de `datos` lo
  reconcilie.

## Verificación

- Unitarias: `procesar-change.spec.ts` (13), `registrar-recepcion.spec.ts` (encolado con doble),
  `consumidor-de-changes.spec.ts`, `clave-de-enrutamiento.spec.ts`.
- `inbox-relay.e2e-spec.ts` contra Neon: POST firmado -> trabajador -> fila en `mensajes` con su
  tenant, conversación, contacto y evento de outbox sin PII; mismo wamid en lote distinto -> una
  fila; reproceso -> `YA_RESUELTO`; desconocido y revocado -> nada de negocio y payload anulado.
- **No verificado:** el encolado y el consumo reales con BullMQ. No hay Docker ni Redis local.
  `worker.ts` arranca bajo `tsx`, resuelve su DI y llega a conectar con Redis (ECONNREFUSED).

## A cola

- Sin Redis real, la ruta BullMQ solo está probada con dobles: verificar con `pnpm infra:up`.
- **Sin relay de barrido**: no existe función de base para listar changes pendientes (el rol
  `viajapro_webhook` solo puede `tomar_recepcion` por id exacto). Un change cuya cola se perdió se
  recupera solo por el reintento de Meta. Pide función a `datos`. Sin ella la alerta de «pendientes
  de más de cinco minutos» tampoco existe.
- Eventos `statuses` (acuses de entrega) y campos de gestión se clasifican y se descartan: sin
  manejador todavía.
- Descarga de medios (`adjuntos.media_id_meta` queda sin `clave_objeto`) y Socket.IO tras el commit.
- `aislamiento.spec.ts` hace `DELETE FROM recepciones_webhook` entero en su `afterAll`: borra
  recepciones ajenas si corre en paralelo con otra prueba (dueño `qa`).

## Correcciones de la auditoría de seguridad (`fix/inbox-auditoria-trabajador`)

1. **R10, errores sin PII.** El trabajo falla con `ErrorDeTrabajo` (clase y código, nunca el mensaje
   original), así que `failedReason` en Redis y el registro solo llevan `Clase:codigo` y el id del
   trabajo. Prueba: un error con «Failing row contains (teléfono, texto)» no aparece ni en el motivo
   ni en el log.
2. **`FOR SHARE`** en la lectura del canal dentro de la transacción de escritura: una revocación
   concurrente ya no se cuela entre la comprobación y el INSERT.
3. **e2e:** un lote con changes de dos agencias (cada uno bajo su tenant) y el mismo wamid en dos
   tenants (dos filas).
