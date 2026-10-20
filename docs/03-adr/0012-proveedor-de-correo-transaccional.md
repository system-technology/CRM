# ADR-0012 — Proveedor de correo transaccional: Postmark, por HTTP, detrás de `PuertoCorreo`

- **Estado:** Propuesto
- **Fecha:** 2026-10-20
- **Decide:** propietario
- **Consultados:** `arquitecto` (autor). Pendiente: `auditor-seguridad` (datos de asesores, tokens en
  tránsito), `devops` (secretos y DNS)

---

## Contexto

Desde la v0.35.0, el módulo `notifications` envía las invitaciones a la agencia y los códigos de un solo
uso (OTP) de inicio de sesión ([ADR-0011](0011-autenticacion-y-tenant-de-sesion.md)). Los envía por la cola
BullMQ `correo-saliente`, con la carga cifrada, hacia `PuertoCorreo`. Hay dos adaptadores: Mailpit (local)
y en memoria (CI). **No hay adaptador de producción**: `crearCorreo` rechaza cualquier otro
`MAIL_PROVIDER` hasta que exista este ADR (CLAUDE.md §10).

Lo que motiva el ADR es la entregabilidad, no el volumen. Un OTP vale 5 minutos. Si tarda o cae en spam,
el asesor no puede entrar, y en un CRM esa es la peor falla que se puede ver. El volumen es pequeño:
50 agencias, unos 300 usuarios y algunos miles de correos al mes, casi todos OTP e invitaciones.

Hay dos restricciones de partida:
- **No hay nombre comercial ni dominio.** Sin dominio propio autenticado (SPF, DKIM y DMARC alineados),
  ningún proveedor garantiza la bandeja de entrada.
- **El correo del asesor es dato personal (Ley 1581).** El proveedor lo procesa fuera de Colombia, así
  que interviene como subencargado del tratamiento
  ([02-proteccion-de-datos.md §5.1](../05-seguridad/02-proteccion-de-datos.md)).

## Opciones consideradas

Precios consultados el **2026-10-20** en las páginas oficiales enlazadas. Volumen base: unos 5.000
correos al mes. Volumen ×10: unos 50.000 correos al mes.

| | Amazon SES | Postmark | Resend | SendGrid |
|---|---|---|---|---|
| Costo base / ×10 (USD/mes) | ~0,50 / ~5 (à la carte, 0,10 por mil) | 15 / ≤ 68,50 (Pro: 16,50 + 1,30 por mil de excedente) | 20 / 20 (Pro: 50.000 incluidos; el plan gratis tiene un tope de 100 al día) | desde 19,95; no publica la tabla por volumen; prueba gratis de 60 días |
| Enfoque | Infraestructura genérica | **Solo transaccional**; el envío masivo va por un *stream* aparte, con infraestructura dedicada | Transaccional y masivo | Transaccional y masivo |
| Dónde procesa | Región elegida; existe `sa-east-1` | EE. UU. (Chicago y AWS); no planea servidores en la UE | Procesamiento principal en EE. UU.; región de envío `sa-east-1` disponible | EE. UU. |
| DPA | DPA de AWS con SCC, se aplica automáticamente | DPA con SCC incluido en los términos | DPA con SCC incluido en los términos | Sí (no verificado hoy) |
| Arranque | *Sandbox*: 200 correos al día y solo a destinatarios verificados. Salir exige una revisión de hasta 96 h y declarar que se manejan rebotes y quejas | Dominio verificado y aprobación de la cuenta | Dominio verificado | Dominio verificado |
| API sin SDK | Exige firma SigV4: o se escribe a mano o se añade `@aws-sdk` | `POST /email` con la cabecera `X-Postmark-Server-Token` | `POST /emails` con `Idempotency-Key` (24 h) | `POST /v3/mail/send` |
| Rebotes y quejas | Por SNS; hay que conectarlos | Lista de supresión automática por *stream* | Lista de supresión automática | Lista de supresión automática |

**Proveedor local o regional.** No encontré ningún proveedor colombiano de correo transaccional por API
con una reputación de envío comparable a la de estos cuatro. «Regional» aquí solo significa la región
`sa-east-1` (São Paulo) de SES o de Resend. No resuelve la Ley 1581: Brasil no está en la lista de la
SIC que se cita abajo, y Resend declara que su procesamiento principal es en EE. UU. de todos modos.

### A — Amazon SES
- **Gana:** el menor costo por mucho y una región en Sudamérica.
- **Cuesta:** una revisión de salida del *sandbox* con un dominio y un sitio que todavía no existen.
  Una cuenta de AWS que hoy no usamos. SigV4 escrito a mano o un SDK. Rebotes por SNS desde el primer
  día, porque la propia revisión los exige. Más operación por un ahorro de unos 15 USD al mes.
- **Cierra:** nada.

### B — Postmark
- **Gana:** es el único de los cuatro dedicado solo a transaccional. Separa el envío masivo en otra
  infraestructura, así que nuestra reputación de envío no la comparten remitentes de boletines. API
  HTTP trivial y supresión automática.
- **Cuesta:** 15 USD al mes desde el primer correo. No tiene clave de idempotencia. Procesa solo en
  EE. UU. Conserva el contenido 45 días por omisión.
- **Cierra:** nada. Es un adaptador detrás del puerto.

### C — Resend
- **Gana:** `Idempotency-Key` nativa, precio plano hasta 50.000 correos y región `sa-east-1`.
- **Cuesta:** es el más joven de los cuatro y mezcla transaccional con masivo. El plan gratis
  (100 al día) se agota con un pico de invitaciones, así que en la práctica son 20 USD al mes.
- **Cierra:** nada.

### D — SendGrid
- **Gana:** es conocido.
- **Cuesta:** no publica el precio por volumen, la prueba gratis caduca a los 60 días y mezcla
  transaccional con masivo. No gana en ningún criterio.
- **Cierra:** nada.

## Decisión

**Postmark, integrado por su API HTTP con `fetch` (Node 22), sin SDK, como adaptador
`CorreoPostmark` de `PuertoCorreo`, con `MAIL_PROVIDER=postmark`.**

El criterio que más pesa es que el OTP llegue en segundos a la bandeja de entrada. Postmark es el único
de los cuatro que vende exactamente eso y aísla el tráfico masivo de otros clientes. La diferencia de
costo con SES, unos 15 USD al mes, es menor que una sola hora de operación de SNS y del *sandbox*.
Resend es la segunda opción y la sustitución es barata: otro adaptador y otro registro DKIM.

**Reglas del adaptador:**
1. **Sin seguimiento.** `TrackOpens: false` y `TrackLinks: "None"`, impuestos en código. Reescribir el
   enlace de invitación lo haría pasar, con su token, por un dominio de seguimiento.
2. **Stream transaccional** (`outbound`). Nunca se envía marketing por esta vía.
3. **Idempotencia (R5).** Postmark no deduplica, así que el `jobId` de BullMQ es la clave. Solo se
   reintenta ante errores de red, 429 o 5xx. Un 4xx, incluido el destinatario suprimido, es un fallo
   definitivo sin reintento. Un duplicado lleva el mismo código o enlace, así que es inofensivo.
4. **Plazo.** Un timeout de 10 s por intento. Los reintentos acaban antes de los 5 minutos de vida
   del OTP: no tiene sentido entregar un código caducado.
5. **Nada del cuerpo en los registros.** Se registran el `MessageID` de Postmark y el código de error,
   nunca el destinatario ni el contenido.

**Rebotes y quejas en v1: sin webhook.** Postmark suprime por sí mismo las direcciones que rebotan o se
quejan. Las invitaciones y los OTP solo se envían cuando alguien los pide, así que una dirección
suprimida se manifiesta como un 4xx en el trabajo fallido. El webhook entra cuando haya correo a viajeros
o un volumen que lo justifique. Va a la cola de `ESTADO.md`.

## Qué se configura

**Variables de entorno** (en `.env.example` y `turbo.json`; en producción, en el gestor de secretos de
la plataforma, nunca en el repositorio, R6):

| Variable | Qué es |
|---|---|
| `MAIL_PROVIDER` | Se añade el valor `postmark`. Se rechaza con `APP_ENV=local` si no hay token |
| `POSTMARK_SERVER_TOKEN` | **Secreto.** El token del *server* de Postmark, solo de envío |
| `POSTMARK_MESSAGE_STREAM` | `outbound` |
| `MAIL_FROM` | Ya existe. Pasa a ser `"<Marca> <no-reply@notificaciones.<dominio>>"` |

Las pruebas del adaptador usan el token de prueba documentado `POSTMARK_API_TEST`: la API lo acepta y
no entrega nada. Así el adaptador se construye y se prueba sin dominio y sin cuenta de pago.

**DNS**, en un subdominio dedicado (`notificaciones.<dominio>`), para aislar su reputación del correo
corporativo:

| Registro | Host | Valor |
|---|---|---|
| DKIM (TXT) | el que muestre Postmark (`<selector>._domainkey.notificaciones`) | la clave pública que muestre Postmark |
| Return-Path (CNAME) | el que muestre Postmark, bajo `notificaciones` | `pm.mtasv.net` |
| DMARC (TXT) | `_dmarc.<dominio>` | `v=DMARC1; p=none; rua=mailto:<buzón de reportes>`. Tras 30 días limpios pasa a `p=quarantine` |
| SPF | — | No hace falta para Postmark: el Return-Path propio da la alineación SPF. Si el dominio raíz ya tiene SPF, no se toca |

**Sin dominio decidido.** El primer despliegue no depende del correo: la agencia piloto se da de alta
por script y entra con contraseña (ADR-0011, rebanada 4). Mientras tanto, el adaptador se integra y se
prueba con `POSTMARK_API_TEST`. Si el OTP hace falta antes de que haya nombre comercial, se registra
un **dominio técnico neutro**, solo para notificaciones. Cuando haya marca, cambia el nombre que se
muestra en `MAIL_FROM`, no el dominio. **No se envía nunca** desde una dirección de Gmail ni desde un
dominio compartido: falla DMARC y entrena a los filtros contra nosotros.

## Consecuencias

### Positivas
- Se cierra el TODO de `crearCorreo` sin dependencias nuevas.
- El OTP queda en manos de un proveedor que solo hace transaccional.
- El adaptador es sustituible: Resend o SES se implementan como otro adaptador del mismo puerto.

### Negativas
- **15 USD al mes fijos** desde antes de tener clientes. A un volumen ×10 pueden llegar a unos 68 USD.
- **Contenido retenido 45 días en Postmark**, y eso incluye los enlaces de invitación vigentes.
  `auditor-seguridad` decide si hace falta el complemento de retención de 7 días o acortar la vida
  de la invitación. Los OTP caducan a los 5 minutos y su retención es inocua.
- **Transmisión internacional a EE. UU.** EE. UU. figura en la lista de países con nivel adecuado de
  la Circular Externa 005 de 2017 de la SIC, según los análisis de 2017. Hay que confirmar con el
  abogado que esa lista sigue vigente. Postmark actúa como subencargado: el DPA de sus términos sirve
  como contrato de transmisión, y el aviso de privacidad y el contrato de encargo con cada agencia
  deben nombrarlo junto con su país.
- Sin webhook de rebotes, una dirección suprimida solo se ve en los trabajos fallidos.

### Qué habría que cambiar para revertir esto
- Escribir otro adaptador, cambiar `MAIL_PROVIDER`, publicar el DKIM nuevo y actualizar el aviso de
  privacidad. No hay esquema ni contratos que migrar.

## Cuándo revisar esta decisión
- Correo a viajeros o masivo: exige el webhook de rebotes y quizá otro *stream* o proveedor.
- Más de 100.000 correos al mes: el costo de SES empieza a pesar.
- El abogado exige procesamiento en Colombia o un país distinto de EE. UU.
- Una tasa de OTP no entregados o en spam por encima del 1 % durante un mes.

## Qué tiene que hacer el propietario
1. **Decidir el dominio.** O el comercial definitivo, o un dominio técnico neutro solo para
   notificaciones si el OTP se necesita antes de tener marca. Registrarlo a nombre de la empresa.
2. **Crear la cuenta de Postmark** con un correo corporativo y aceptar sus términos, que incluyen el
   DPA. Contratar el plan Basic (15 USD al mes) y crear un *server* `viajapro-produccion`.
3. En Postmark, **añadir el dominio** `notificaciones.<dominio>` y copiar los registros DKIM y
   Return-Path que muestre el panel.
4. **Publicar en el DNS** el DKIM, el Return-Path y el DMARC de la tabla anterior. Pulsar *Verify*;
   la verificación puede tardar hasta 48 h.
5. Entregar el `POSTMARK_SERVER_TOKEN` a `devops` **por el gestor de secretos**, nunca por chat ni en
   el repositorio.
6. **Pedirle al abogado** dos cosas: confirmar la vigencia de EE. UU. en la lista de la SIC e incluir
   a Postmark (EE. UU.) en el aviso de privacidad y en el contrato de encargo con las agencias.

---

Fuentes, consultadas el 2026-10-20:
[precios de SES](https://aws.amazon.com/ses/pricing/) ·
[regiones de SES](https://docs.aws.amazon.com/general/latest/gr/ses.html) ·
[*sandbox* de SES](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) ·
[RGPD y DPA de AWS](https://aws.amazon.com/compliance/gdpr-center/) ·
[precios de Postmark](https://postmarkapp.com/pricing) ·
[privacidad y DPA de Postmark](https://postmarkapp.com/eu-privacy) ·
[API de Postmark](https://postmarkapp.com/developer/user-guide/send-email-with-api) ·
[*streams* de Postmark](https://postmarkapp.com/support/article/1207-how-to-create-and-send-through-message-streams) ·
[DNS de Postmark](https://postmarkapp.com/support/article/1046-how-do-i-verify-a-domain) ·
[precios de Resend](https://resend.com/pricing) ·
[regiones de Resend](https://resend.com/docs/dashboard/domains/regions) ·
[DPA de Resend](https://resend.com/legal/dpa) ·
[idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys) ·
[precios de SendGrid](https://www.twilio.com/en-us/products/email-api/pricing) ·
[Circular 005/2017, Holland & Knight](https://www.hklaw.com/publications/Cambios-en-la-Transferencia-de-Datos-Personales-a-Otros-Paises-08-25-2017/).
