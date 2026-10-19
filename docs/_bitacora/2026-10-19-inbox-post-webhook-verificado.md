# 2026-10-19 — El POST del webhook, verificado de punta a punta

Rama `feat/inbox-webhook-post`. Tarea 4b de `ESTADO.md`.

## Hallazgo

El `POST /webhooks/whatsapp` con persistencia durable **ya existía** (`7e99415`: firma HMAC sobre el
cuerpo crudo, `registrar_recepcion`, 403/200/500). Lo que faltaba era la prueba ensamblada y la
verificación viva. Esta sesión añade ambas; no cambia código de producción.

## Divergencia con el encargo, y por qué

El encargo pedía resolver el tenant por `phone_number_id` en el POST y que un número desconocido no
persistiera nada. El ADR-0008 §4 dice lo contrario y manda: el POST persiste el sobre **cerrado**
antes de saber de quién es (no se devuelve 200 sin fila durable), y resolver con `viajapro_webhook`
(`resolver_enrutamiento`, `tomar_recepcion`) es trabajo del relay/trabajador, que además anula el
payload de lo desconocido o revocado. La respuesta es idéntica para número conocido o no: no filtra.

## Verificación

- `inbox-webhook.e2e-spec.ts` (AppModule real, Neon): firma inválida y ausente -> 403 sin fila;
  mensaje válido -> 200 y 1 recepción + 1 change; mismo cuerpo dos veces -> 1 fila; número
  desconocido -> misma respuesta; el payload guardado no contiene teléfono ni texto. Limpia lo suyo.
- API viva en :3391 con secretos temporales en memoria: firma mala 403, firmado 200, reintento 200,
  y en `neondb` una fila de recepción y un change `PENDIENTE`. Fila borrada tras comprobar.

## A cola

- **4f**: `resolver_enrutamiento` devuelve `ACTIVO` para un canal `REVOCADO` en `canales`. Es
  migración/reconciliación (`datos`) y solo importa cuando exista el trabajador que resuelve: no se
  toca aquí.
- Relay por `change` y trabajador (paso 5 del ADR §4: encolar con `jobId`) siguen pendientes.
