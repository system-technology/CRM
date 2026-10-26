# ADR-0018 — Envío saliente de WhatsApp: cola, idempotencia y origen de la credencial

- **Estado:** Propuesto
- **Fecha:** 2026-10-26
- **Decide:** Propietario del producto
- **Consultados:** `whatsapp` (redacta). Pendientes: `arquitecto`, `auditor-seguridad` (toca
  credenciales de tenant), `datos` (§7)
- **Enmienda:** [ADR-0002](0002-whatsapp-cloud-api.md), solo en el nombre y el alcance del puerto
  (§1). Lo demás de 0002 sigue vigente tal cual.

---

## Contexto

La bandeja **recibe** mensajes reales (webhook firmado → cola → base bajo RLS), pero nada los
**envía**: `POST /api/v1/conversaciones/:id/mensajes` guarda la respuesta del asesor como
`PENDIENTE` y escribe `inbox.mensaje_saliente_creado` en el outbox, y ahí se queda. Ningún código
llama a la Graph API. Es la distancia más corta entre el producto actual y un CRM utilizable
(roadmap v3, fase 1).

Fuerzas: R5 (todo efecto externo es idempotente y pasa por cola), AGENTS.md §5 (nunca red dentro de
una transacción), R6 (credenciales de tenant cifradas), la ventana de 24 h y la tabla de errores de
Meta verificada en `docs/04-integraciones/01-whatsapp-cloud-api.md` §9.

## Decisión

### 1. Un puerto de envío, estrecho (enmienda a 0002)

0002 nombraba un puerto `MessagingProvider` con seis operaciones. Se empieza por la única que hace
falta: **`PuertoEnvioWhatsapp.enviarTexto(pedido) → { wamid }`**, que lanza siempre un
`ErrorDeEnvioWhatsapp` ya clasificado. Las demás operaciones (plantilla, medios, interactivos,
salud del número) se añaden al mismo puerto cuando se construyan; el principio de 0002 —el dominio
no sabe que existe Meta— no cambia.

- **Adaptador real** `EnvioWhatsappGraph`: `fetch` contra `{META_GRAPH_BASE_URL}/{versión}/{phone_number_id}/messages`,
  timeout de 10 s por intento y **hasta dos reintentos con espera creciente (×3)**, solo cuando es
  seguro: Meta respondió que no lo aceptó (429, 5xx, códigos transitorios) o la conexión no llegó a
  abrirse (DNS, conexión rechazada).
- **Adaptador falso** `EnvioWhatsappFalso` para pruebas. Ninguna prueba ni comando llama a Meta: la
  prueba del adaptador real levanta una Graph API falsa en `127.0.0.1`.

### 2. El envío pasa por cola, y lo encola el relay del outbox

El evento `inbox.mensaje_saliente_creado` ya se escribe en la misma transacción que el mensaje. El
**relay del outbox** (trabajador) lo convierte en un trabajo de la cola BullMQ `inbox-envios`
**antes** de publicarlo en el bus; si encolar falla, la tanda no se marca y se repite. Así no hay un
«encolar después de confirmar» en la API que pueda perderse si el proceso muere entre las dos
cosas.

- El trabajo lleva **solo** `{ tenantId, mensajeId }`. Ni texto, ni teléfono, ni token pasan por
  Redis.
- **`jobId = envio-<mensajeId>`**: el relay entrega al menos una vez y BullMQ descarta el repetido.
- Seis intentos con espera exponencial desde 3 s (~90 s en total). Una respuesta de chat media hora
  tarde ya no es una respuesta: en el último intento, un fallo pasajero queda `FALLIDO` explicado
  en vez de «pendiente» para siempre.

### 3. La ventana de 24 h se aplica dos veces, en el servidor

Con la misma función de dominio (`exigirVentanaAbierta`, sobre `ventana-de-servicio.ts`):

1. Al registrar la respuesta (API): fuera de la ventana, `VentanaCerradaError` (`409
   VENTANA_CERRADA`, «solo se pueden enviar plantillas»). Ya existía; ahora sale de una sola regla.
2. En el trabajador, justo antes de llamar a Meta: la ventana pudo cerrarse mientras el mensaje
   esperaba. Se marca `FALLIDO` con ese mismo motivo y **no se llama a Meta**.

Si aun así Meta responde `131047`, nuestra ventana y la suya discrepan: queda `FALLIDO` con el código
crudo, que es la evidencia de la deriva (§7.2 de la integración).

### 4. Idempotencia: un mensaje nunca sale dos veces

La cola reintenta, el relay repite y un proceso puede morir a mitad de la llamada. Tres capas:

1. **El mensaje mismo**: si ya tiene `wamid` o no está `PENDIENTE`, el trabajo no hace nada.
2. **La reserva** (`PuertoReservaDeEnvio`, `SET NX` en Redis, 7 días) se pone **antes** de llamar a
   Meta y solo se quita cuando Meta respondió que **no** lo aceptó. Si el proceso murió con la
   reserva puesta, el reintento no reenvía: marca el mensaje `FALLIDO` «sin confirmar».
3. **Un timeout o una conexión cortada a medias no se reintentan nunca**: también «sin confirmar».

«Sin confirmar» no es una mentira permanente: cada envío lleva **`biz_opaque_callback_data` = id de
nuestro mensaje**, y Meta lo devuelve en los webhooks de estado (verificado en la referencia del
webhook de estado, 2026-10-26). Si Meta sí lo aceptó, su primer estado encuentra el mensaje por esa
referencia, guarda el `wamid` y sustituye nuestra suposición. Regla de la máquina de estados
(`estado-de-entrega.ts`): **mientras no conocemos el `wamid`, el reporte de Meta manda**; con el
`wamid` conocido, solo se avanza (`PENDIENTE → ENVIADO → ENTREGADO → LEIDO → REPRODUCIDO`) y
`FALLIDO` es terminal y gana siempre.

La misma referencia resuelve la carrera inversa: el webhook `sent` que llega antes de que el
trabajador haya guardado el `wamid` de la respuesta.

### 5. Estados del mensaje saliente

| Estado | Quién lo pone |
|---|---|
| `PENDIENTE` (en cola) | La API al registrarlo. Sigue así tras la respuesta de Meta, que solo guarda el `wamid`: «aceptado» no es «enviado» |
| `ENVIADO`, `ENTREGADO`, `LEIDO`, `REPRODUCIDO` | Los webhooks de estado (`sent`, `delivered`, `read`, `played`) |
| `FALLIDO` | El trabajador (error definitivo, último intento, ventana, canal, credencial, sin confirmar) o el webhook `failed` |

Cada cambio escribe `inbox.mensaje_actualizado` en el outbox, en la misma transacción; la API lo
emite como `MENSAJE_ACTUALIZADO` (contrato que ya existía) solo a quien ve la conversación.

### 6. Errores de Meta → errores de dominio

`errorDeMeta(código, http)` traduce la tabla de §9: `131047` → `FueraDeVentanaError`; `131026` →
`DestinatarioNoDisponibleError`; `130429`, `131056`, `80007`, `4` → `LimiteDeTasaError`
(reintentable); `190`, `0`, `3`, `10`, `131005` → `CredencialInvalidaError` (nunca se reintenta);
`131031`, `368`, `131042` → `CuentaRestringidaError`; `2`, `131000`, `131016`, `133004`, `131057` →
`FalloTransitorioDeMetaError` (reintentable); sin código, decide el HTTP. En `mensajes` se guardan el
código crudo (`codigo_error_meta`) y el motivo en español para el asesor (`motivo_fallo`). **El texto
de Meta (`message`, `error_data.details`) no se guarda ni se registra**: puede repetir el número del
viajero (R10).

### 7. De dónde sale la credencial

Puerto `PuertoCredencialesWhatsapp.paraCanal(tenantId, canal) → { phoneNumberId, token }`. El resto
del flujo no sabe de dónde viene.

- **Fase de prueba (hoy):** `CredencialesDePrueba`, con `META_SYSTEM_USER_TOKEN` y
  `META_PHONE_NUMBER_ID_PRUEBA`. **Solo sirve al canal cuyo `phone_number_id` es el de prueba**: un
  token de usuario del sistema puede alcanzar más de un WABA, y sin esa restricción cualquier canal
  de la base enviaría con el token de la plataforma. Sin esas variables, cada mensaje queda
  `FALLIDO` con un motivo claro y el arranque lo avisa.
- **Producción:** un adaptador nuevo que lea el token **por agencia** de `cuentas_whatsapp`
  (`token_cifrado`, `token_nonce`, `token_tag`, AES-256-GCM, R6), obtenido en el Embedded Signup.
  No se escribe hasta que exista el Embedded Signup (no hay filas que leer). Cambiarlo es cambiar
  una línea del módulo del trabajador.

### 8. Lo que NO se hace aún

Plantillas (incluidas las de marketing), medios, listas y botones interactivos, ubicación,
contactos y reacciones salientes; el *limiter* por tenant de la cola (§9.2 de la integración: hoy
un tenant con 429 frena la cola compartida unos segundos); marcar el canal `DESCONECTADO` ante un
`190` y avisar al dueño; el adaptador de credenciales por agencia.

## El esquema

**El esquema actual permite el vertical completo.** `mensajes` ya tiene `estado`, `wamid` (único por
tenant), `clave_idempotencia`, `motivo_fallo` y `codigo_error_meta`; `canales.phone_number_id` y
`cuentas_whatsapp.token_*` existen. No hace falta ninguna migración para esto.

Una columna recomendada, **en cola y no bloqueante**, para `datos`: `mensajes.envio_reservado_en
timestamptz NULL` (misma tabla, ya con `tenant_id` y RLS), que sustituiría la reserva de Redis por
una marca durable junto al mensaje, con un `UPDATE ... WHERE envio_reservado_en IS NULL` como
reserva. Hoy la reserva vale exactamente lo que vale la cola: si Redis pierde datos, también pierde
los trabajos.

## Consecuencias

### Positivas
- Lo que escribe el asesor llega al viajero, con estado visible y motivo en español si falla.
- Ningún camino conocido manda el mismo mensaje dos veces.
- Cambiar de credencial de prueba a credencial por agencia no toca el flujo.

### Negativas
- Un timeout real de Meta deja el mensaje «sin confirmar» hasta que llegue su webhook; si Meta no lo
  aceptó, el asesor tiene que reenviarlo a mano.
- El trabajador necesita Redis para la reserva, además de para la cola.
- Hasta el adaptador por agencia, solo el número de prueba puede enviar.

### Qué habría que cambiar para revertir esto
Un adaptador nuevo detrás de `PuertoEnvioWhatsapp` (un BSP, por ejemplo). El caso de uso, la cola,
la máquina de estados y los contratos no cambian.

## Cuándo revisar esta decisión
- Cuando exista el Embedded Signup: adaptador de credenciales por agencia (con `auditor-seguridad`).
- Si el volumen hace que un tenant limitado frene a los demás: *limiter* por grupo.
- Si Meta deja de devolver `biz_opaque_callback_data` en los estados.
