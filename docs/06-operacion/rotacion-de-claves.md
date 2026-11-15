# Rotación de claves y secretos

| Campo | Valor |
|---|---|
| Estado | **Procedimiento escrito leyendo el código. Ninguna rotación se ha ejecutado ni ensayado** |
| Fecha | 2026-11-15 |
| Responsable | `devops` (procedimiento); propietario (custodia: pega los valores en el panel; ver S5) |
| Cierra | Hallazgo bajo «sin runbook de rotación» de la [auditoría 2026-11-15](../_auditorias/2026-11-15-auditoria-integral.md), tarea T-211 |
| Complementa | [`07-gestion-de-secretos-y-claves.md`](../05-seguridad/07-gestion-de-secretos-y-claves.md) (reglas y periodicidad), que sigue siendo borrador |

## 1. Reglas que valen para todas

- **Ante sospecha de fuga se rota primero y se investiga después** ([09-respuesta-a-incidentes.md](../05-seguridad/09-respuesta-a-incidentes.md)).
- Los secretos se generan en la máquina del propietario con `openssl rand` y se pegan **en el panel** del proveedor. Nunca por chat, ni por un agente (S5).
- **Un secreto nuevo por entorno.** Nunca se reutiliza el de otro entorno (S2).
- Cada rotación deja **una línea en `docs/_bitacora/`** con fecha, nombre del secreto (nunca el valor) y motivo.
- Antes de rotar una clave de cifrado, **guardar la copia de la vieja** fuera del proveedor hasta que se confirme que nada la necesita (S6).
- El código **aborta al arrancar** si falta un secreto obligatorio (S4). Si tras un cambio el proceso no arranca, es la protección funcionando: revisar el valor, no relajarla.

## 2. Resumen: qué rompe y si hay ventana doble

| Variable | Quién la lee | ¿Ventana doble en el código? | Si se rota sin cuidado |
|---|---|---|---|
| `BETTER_AUTH_SECRET` | API (`crear-auth.ts`) | **No** | Todos los usuarios pierden la sesión y deben volver a entrar |
| `META_APP_SECRET` | API (`registrar-recepcion.ts`) | **No** | Todo webhook de Meta se rechaza con 403 hasta que el despliegue y Meta coinciden |
| `ENCRYPTION_MASTER_KEY` | **Ningún código hoy** | No aplica | Nada se rompe: no es la clave de ADR-0015 (ver §5) |
| `CAMPOS_SENSIBLES_KEY` + `_VERSION` + `_PREVIOUS` | API y trabajador (`shared/cifrado/cifrado-de-campos.ts`) | **Sí para leer**, una versión anterior; **no hay recifrado** | Sin ella no arrancan; con otra clave y la misma versión, todo lo cifrado queda **ilegible** |
| `WEBHOOK_PAYLOAD_KEY` + `_VERSION` + `_PREVIOUS` | API (sella) y trabajador (abre) | **Sí**, una versión anterior | El trabajador no puede abrir las recepciones aún sin procesar |
| `WHATSAPP_DIRECTORY_PEPPER` + `_VERSION` + `_PREVIOUS` | Trabajador (resuelve el tenant); script de canal de prueba (escribe) | **Sí** para leer; **no hay herramienta** para reconstruir | Los mensajes entrantes quedan «desconocidos» y se **borran** |
| `CORREO_PAYLOAD_KEY` | API (encola) y trabajador (envía) | **No** | Los correos encolados con Redis y aún sin enviar quedan ilegibles |

## 3. `BETTER_AUTH_SECRET`

**Qué es.** Firma las cookies de sesión (Better Auth, ADR-0011). Mínimo 32 caracteres; la API se niega
a arrancar sin él (`leerSecretoDeAutenticacion`). Solo lo lee la API: la web y el trabajador no lo
reciben.

**Qué rompe.** El código no admite dos secretos a la vez. Al cambiarlo, las cookies existentes dejan
de validar: **todos los usuarios tienen que iniciar sesión otra vez**. No se pierden datos. Las
sesiones viven en la base con el token hasheado y siguen ahí, pero ninguna cookie las alcanza ya.

**Cómo, sin caída.** No hay forma de evitar el cierre de sesiones; sí de evitar la caída del servicio:

1. Elegir un momento de poco uso y avisar a la agencia con antelación.
2. Generar el valor nuevo: `openssl rand -base64 48`.
3. Pegarlo en el panel como `BETTER_AUTH_SECRET` de la API y desplegar. Con un solo proceso (`unico`)
   hay un reinicio breve; con varias instancias, un despliegue gradual deja un rato en que unas
   aceptan la cookie y otras no (el usuario ve un cierre de sesión aislado, no una caída).
4. Comprobar `/salud/listo` y entrar con un usuario de prueba.
5. Anotar en la bitácora.

**Cuándo.** Anual o ante sospecha (doc 07 §4).

## 4. `META_APP_SECRET`

**Qué es.** El secreto de la app de Meta con el que se verifica la firma `X-Hub-Signature-256` de cada
webhook (HMAC sobre los bytes crudos). Lo lee la API en cada petición.

**Qué rompe.** El código compara contra **un solo** secreto. Una firma que no corresponde recibe
**403** (`FIRMA_INVALIDA`). Entre el momento en que Meta empieza a firmar con el secreto nuevo y el
momento en que el despliegue lo tiene, **todo webhook se rechaza**. No se pierde un mensaje de forma
definitiva: Meta reintenta con retroceso exponencial y, según `docs/04-integraciones/01-whatsapp-cloud-api.md`
§3.3, hay que diseñar para **7 días** de reintentos (marcado allí como no verificado de forma oficial).

**Cómo, con la ventana más corta posible.** No existe ventana doble. Si Meta cambia el secreto en el
mismo instante en que se pide, hay que tener el valor nuevo **antes** de que Meta lo active:

1. **Por verificar:** si el panel de Meta deja ver el secreto nuevo antes de que empiece a firmar con él. Si lo deja, pegar el nuevo en el panel del proveedor de cómputo y desplegar en el mismo minuto. Si no lo deja, asumir que habrá una ventana de rechazos.
2. Hacerlo en horario de poco tráfico.
3. Probar con un webhook firmado: `scripts/firmar-webhook-whatsapp.mjs` firma con el secreto que se le pase; debe responder 200.
4. Dar por buenos los reintentos de Meta durante los minutos siguientes; mirar que `POST rechazado: firma inválida` en los registros deje de aparecer.
5. Anotar en la bitácora.

**Mejora en la cola, no hecha:** aceptar dos secretos a la vez (`META_APP_SECRET_PREVIOUS`), como ya se
hace con la clave del payload. Quitaría la ventana de rechazos.

**No confundir con** `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (token de la suscripción, lo lee el controlador al
verificar) ni con el token del usuario del sistema (`META_SYSTEM_USER_TOKEN`), que se regeneran en el panel de Meta y se pegan igual.

**Cuándo.** Ante sospecha o salida de una persona con acceso.

## 5. `ENCRYPTION_MASTER_KEY`

**Estado real.** La busqué en `apps/` y `packages/`: **ningún código TypeScript la lee.** Solo la
generan `scripts/dev-nube.mjs` y `scripts/infra-unico.mjs`, y `infra/docker/docker-compose.unico.yml`
la exige (`${ENCRYPTION_MASTER_KEY:?}`, el compose falla si falta). Las credenciales de WhatsApp de la
fase de prueba salen del entorno (`credenciales-whatsapp.entorno.ts`), no de la base cifrada.

**Qué rompe hoy.** Nada: rotarla no cambia el comportamiento. Mantener el valor igual en todos lados
sí importa porque el compose no arranca sin él.

**Nombre fijado (T-212).** El cifrado de campos sensibles usa **`CAMPOS_SENSIBLES_KEY`**, el nombre
que fija ADR-0015, y no esta variable. `ENCRYPTION_MASTER_KEY` sigue sin lector: queda para las
credenciales de tenant en reposo (R6), cuando existan. Ver §5 bis.

## 5 bis. `CAMPOS_SENSIBLES_KEY` (ADR-0015, T-212)

**Qué es.** La maestra de AES-256-GCM de las cinco columnas con PII sensible (`mensajes.texto`,
`conversaciones.ultimo_mensaje_texto`, `contactos.preferencias`, `notas_internas.texto`,
`adjuntos.nombre_archivo`). De ella se deriva una clave por agencia y por columna con HKDF-SHA256.
La leen la API y el trabajador (`CifradoModule`); **ninguno arranca sin ella ni sin
`CAMPOS_SENSIBLES_KEY_VERSION`**. La web nunca la recibe.

**Qué rompe.** Cada fila guarda la versión con la que se cifró. El código abre la versión vigente y,
si está `CAMPOS_SENSIBLES_KEY_PREVIOUS`, la anterior (`VERSION - 1`). **Cambiar la clave sin subir
la versión deja ilegible todo lo ya cifrado** (la lectura responde 500 `CAMPO_CIFRADO_ILEGIBLE`).
**Perderla es perder todo lo cifrado**: no hay forma de recuperarlo desde la base.

**Cómo se rota hoy (sin recifrado).** 1) Guardar la actual fuera del proveedor (S6). 2) Poner la
actual en `CAMPOS_SENSIBLES_KEY_PREVIOUS`, la nueva en `CAMPOS_SENSIBLES_KEY` y subir
`CAMPOS_SENSIBLES_KEY_VERSION` en uno, a la vez en API y trabajador. Lo nuevo se cifra con la nueva y
lo viejo se sigue leyendo con la anterior. **No se puede retirar la anterior** hasta que exista el
trabajo de recifrado por lotes (ADR-0015, en cola): una segunda rotación sin él deja ilegible lo de
dos versiones atrás.

**Tope de uso.** ADR-0015 fija rotar antes de 2^31 cifrados por clave derivada (agencia, columna y
versión), con la cuenta sacada de la base. La cuenta y su alarma tampoco existen todavía (cola).

## 6. `WEBHOOK_PAYLOAD_KEY` y su versión

**Qué es.** Clave de 32 bytes (hex o base64) con la que se cifra, con AES-256-GCM, el cuerpo de cada
webhook mientras no se sabe de qué agencia es. La API **sella** (`registrar-recepcion.ts`) y guarda
`clave_version` en la fila; el trabajador **abre** (`procesar-change.ts`). El cuerpo vive minutos: se
anula al clasificar (`anulado_en`).

**Cómo decide el código con qué clave abrir.** `claveParaVersion`: si la versión de la fila es igual a
`WEBHOOK_PAYLOAD_KEY_VERSION`, usa `WEBHOOK_PAYLOAD_KEY`; **si no, usa `WEBHOOK_PAYLOAD_KEY_PREVIOUS`**.
Solo cabe **una** versión anterior. `WEBHOOK_PAYLOAD_KEY_VERSION` debe ser un entero ≥ 1, o la API
lanza error al sellar.

**Procedimiento (rotar de la versión *n* a *n+1*):**

1. Generar la clave nueva: `openssl rand -base64 32`.
2. **Primero el trabajador** (o el único proceso en modo `unico`): fijar `WEBHOOK_PAYLOAD_KEY` = nueva, `WEBHOOK_PAYLOAD_KEY_VERSION` = *n+1* y `WEBHOOK_PAYLOAD_KEY_PREVIOUS` = la vieja. Desplegar.
3. **Después la API** con los mismos tres valores. El orden importa: si la API sellara con *n+1* antes de que el trabajador lo sepa, el trabajador vería una versión que no es la suya, buscaría en `_PREVIOUS` (que aún no la tiene o tiene otra clave) y fallaría al abrir.
4. Probar con un webhook firmado de prueba: debe llegar a la bandeja.
5. **Esperar a que se vacíen las filas viejas.** Comprobar que no queda ninguna recepción con la versión *n* y el payload aún sin anular. Con el rol del trabajador (`viajapro_webhook`), algo como: `SELECT clave_version, count(*) FROM recepciones_webhook WHERE payload_cifrado IS NOT NULL GROUP BY 1;` (la tabla no tiene RLS: ver el comentario del modelo `RecepcionWebhook`).
6. Solo entonces vaciar `WEBHOOK_PAYLOAD_KEY_PREVIOUS`. **No encadenar dos rotaciones** (*n* → *n+1* → *n+2*) sin que *n* se haya vaciado: las filas de *n* no tendrían con qué abrirse.
7. Anotar en la bitácora. Conservar la clave vieja en la copia del propietario hasta el paso 6.

**Qué se rompe si se hace mal.** Cambiar la clave sin `_PREVIOUS`: las recepciones aún sin procesar
no se pueden abrir y el trabajador falla con ellas. Meta ya recibió el 200 de esas recepciones, así que
no las reenviará: lo que no se abra a tiempo **se pierde**. No verifiqué qué hace el barrido con una fila
que no puede descifrar.

**Estado de la purga.** La función `purgar_payloads` existe en la base, pero **ningún trabajo
programado la invoca** (política 10 §6). Las filas se anulan al clasificar; la purga las borra después.
Para rotar solo importa que el payload esté anulado.

**Cuándo.** Anual o ante sospecha.

## 7. La pimienta de WhatsApp

**Qué es.** `WHATSAPP_DIRECTORY_PEPPER`. La clave de ruteo de un número se guarda como
`HMAC-SHA256(pimienta, 'pn:' || phone_number_id)` en `enrutamiento_canales`, con su
`pimienta_version`. Con la pimienta fuera de la base, un volcado no revela ningún identificador. La
lee el trabajador al resolver a qué agencia pertenece un mensaje; la escribe el script
`canal:registrar-prueba` (y, cuando exista, el registro de canales reales).

**Cómo lee el código.** `resolverRuta` prueba primero con `WHATSAPP_DIRECTORY_PEPPER` y, si no hay
fila, con `WHATSAPP_DIRECTORY_PEPPER_PREVIOUS`.

**El peligro.** Si el directorio no tiene fila para el número, el mensaje se clasifica como
`DESCONOCIDO` y **su contenido se borra en el acto**. Cambiar la pimienta sin reconstruir el
directorio hace desconocidos a todos los números. Por eso existe
`WHATSAPP_DIRECTORY_REBUILD_IN_PROGRESS=true`: mientras valga `true`, la rama «sin fila» **retiene**
(estado `RETENIDO`) en vez de borrar.

**Lo que NO existe.** No hay herramienta que recalcule el directorio con la pimienta nueva. El único
escritor es `canal:registrar-prueba`, y su propio comentario dice que no implementa el procedimiento de
ventana doble con reconstrucción. **Hoy no se puede completar esta rotación de forma soportada**, salvo
en el entorno de prueba (un solo canal, que se puede volver a registrar).

**Procedimiento que sí es seguro hoy, en un entorno con solo el canal de prueba:**

1. Fijar `WHATSAPP_DIRECTORY_REBUILD_IN_PROGRESS=true` en el trabajador y desplegar.
2. Fijar `WHATSAPP_DIRECTORY_PEPPER` = nueva, `WHATSAPP_DIRECTORY_PEPPER_VERSION` = *n+1* y `WHATSAPP_DIRECTORY_PEPPER_PREVIOUS` = la vieja. Desplegar.
3. Volver a registrar el canal con la pimienta nueva: `pnpm --filter @viajapro/api canal:registrar-prueba` (lee las mismas variables).
4. Probar con un webhook firmado: debe llegar a la bandeja.
5. Poner `WHATSAPP_DIRECTORY_REBUILD_IN_PROGRESS=false` y vaciar `_PREVIOUS`. **La rotación termina cuando acaba la reconstrucción, no cuando se cambia el secreto.**

**Con agencias reales: no rotar** hasta que `backend` construya y pruebe la reconstrucción del
directorio. Es una tarea por abrir: busqué «pimienta» y «directorio» en `roadmap/tasks.yaml` y no hay ninguna sobre reconstruir el directorio de canales.

**Cuándo.** Anual o ante sospecha, con la salvedad anterior.

## 8. `CORREO_PAYLOAD_KEY` (extra)

No estaba en el encargo, pero está en la misma familia. Cifra el mensaje de correo mientras viaja por
Redis (lleva tokens de invitación y códigos de un solo uso); la comparten API y trabajador y **no tiene
versión** (`sellado-de-correo.ts`). Cambiarla deja ilegibles los correos ya encolados y sin enviar. Los
códigos caducan a los 5 minutos y las invitaciones se pueden reenviar, así que el daño es acotado.
Procedimiento: esperar a que la cola de correo esté vacía, cambiar la clave en API y trabajador en el
mismo despliegue y anotar. En el modo `unico` la cola de correo vive en memoria (`cola-de-correo.en-proceso.ts` no usa esta clave), así que no hay nada persistido que se pierda.

## 9. Lo que no se pudo verificar

- Que el panel de Meta muestre el secreto nuevo antes de activarlo (§4).
- El plazo real de reintento de Meta (el repositorio lo da como 7 días, de fuente no oficial).
- Si un despliegue gradual en el proveedor de cómputo deja instancias con secretos mezclados durante la rotación de `BETTER_AUTH_SECRET`; depende del proveedor y no hay ninguno desplegado.
- Que `BETTER_AUTH_SECRET` no firme nada más que las cookies (por ejemplo, tokens de verificación): lo lee solo `crear-auth.ts`, pero lo que Better Auth hace con él por dentro no se auditó.
- Nada de esto se ejecutó: es lectura de código.
