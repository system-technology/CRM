# Modelo de amenazas

| Campo | Valor |
|---|---|
| Fecha | 2026-10-20 |
| Estado auditado | `main` en `3a1369a` (v0.38.0). **Nada desplegado** |
| Origen | Auditoría externa, hallazgo **AUD-003 (P2)** |
| Autor | `arquitecto`. Revisión pendiente: `auditor-seguridad`, que es el responsable del documento |
| Método | STRIDE por superficie, contrastado con el código y las pruebas, no con el informe |

> **Sobre la ubicación.** La auditoría propuso `docs/seguridad/`. El documento va aquí porque
> `docs/05-seguridad/` es la convención del repo y este archivo ya existía como marcador. El número
> `03` lo ocupa `03-politicas-whatsapp.md`.

**Cómo leer la columna «Prueba».** Las rutas son relativas a la raíz. `AISL-n` es la aserción
numerada `n` de `packages/database/tests/aislamiento.spec.ts`. Entre comillas va el título del `it`.
**Sin control** significa que no existe ningún control en el código. **Parcial** significa que hay
un control, pero no cubre toda la amenaza o no tiene prueba.

---

## 1. Activos

| Activo | Dónde vive | Por qué importa |
|---|---|---|
| Datos de cada agencia (contactos, conversaciones, cotizaciones) | PostgreSQL (Neon), bajo RLS | Una fuga entre agencias mata el producto (R1) |
| Texto de los mensajes del viajero (pasaportes, menores, salud) | `mensajes.texto` y `conversaciones.ultimo_mensaje_texto`, **en claro** | R10 y Ley 1581. Ver ADR-0014 |
| Neto y margen | Tarifas y versiones de cotización | Secreto comercial de la agencia (R10) |
| Sesiones e identidades | Tablas globales de identidad | Suplantación y escalada |
| Secretos | Entornos de Render y `.env` locales | `META_APP_SECRET`, claves AES, pimienta, `BETTER_AUTH_SECRET`, `POSTMARK_SERVER_TOKEN` |
| La rama `main` y los despliegues | GitHub y Render | Lo que llega a `main` llega a los usuarios |

## 2. Límites de confianza

| # | Límite | Qué lo cruza | De qué se fía el lado interno |
|---|---|---|---|
| LC1 | Internet → API, en `/webhooks/whatsapp` | `POST`s de Meta o de cualquiera | Solo de la firma HMAC sobre el cuerpo crudo. **Nunca** del tenant del payload |
| LC2 | Navegador → API (REST y Socket.IO) | Cookie de sesión, `Origin`, cuerpos JSON | Solo de la sesión verificada en el servidor y revalidada bajo RLS en cada petición |
| LC3 | Dentro de la agencia, de asesor a asesor | Los permisos del rol | Del permiso leído de la base, no del cliente (visibilidad y margen) |
| LC4 | Proceso → PostgreSQL | Un rol de login por proceso | RLS forzada y la guardia de rol al arrancar (R2) |
| LC5 | API ↔ Redis ↔ trabajador | Trabajos de BullMQ y pub/sub | Redis no es de confianza para el contenido: solo lleva identificadores o datos cifrados |
| LC6 | API → terceros (Postmark, Meta) | Correo y, en el futuro, mensajes salientes | El token del proveedor. El tercero retiene lo que se le manda |
| LC7 | Desarrollador o agente → `main` → Render | Commits, Actions, migraciones, *deploy hooks* | Los hooks locales y el CI. **No hay protección de rama en el servidor** |

## 3. Matriz STRIDE por superficie

### 3.1 Webhook de Meta (`POST` y `GET /webhooks/whatsapp`), LC1

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| W1 | S | Un `POST` falsificado inyecta mensajes en una agencia | HMAC-SHA256 sobre el cuerpo crudo (`firma-webhook.ts`). Sin secreto, se rechaza | `apps/api/src/modules/inbox/domain/firma-webhook.spec.ts`; `inbox-webhook.e2e-spec.ts` «firma inválida -> 403 y ninguna fila» |
| W2 | S | Se suplanta el apretón de manos `GET` | `verify_token` comparado en tiempo constante | `inbox/domain/verificacion-suscripcion.spec.ts` «RECHAZA un token que solo coincide en el prefijo» |
| W3 | T | El payload trae el tenant y lo desvía hacia otra agencia | El tenant sale del directorio con HMAC por `phone_number_id` y exige directorio y `canales` en `ACTIVO` | AISL-16; `inbox-relay.e2e-spec.ts` «un lote con changes de DOS agencias…» y «canal REVOCADO…» |
| W4 | T | Un webhook legítimo se reenvía para duplicar mensajes | Idempotencia por `(tenant_id, wamid)` y `jobId` determinista | AISL-40; `inbox-webhook.e2e-spec.ts` «el mismo wamid reintentado dos veces» |
| W5 | I | Se sondea qué números son clientes nuestros | Misma respuesta para un número conocido y uno desconocido | `inbox-webhook.e2e-spec.ts` «número desconocido: misma respuesta…» |
| W6 | I | El staging sin RLS mezcla PII de varias agencias | AES-256-GCM con AAD = `recepcion_id` y anulación tras procesar | `inbox-webhook.e2e-spec.ts` «lo guardado va cifrado…»; AISL-19 |
| W7 | D | Inundación de `POST`s, firmados o no | **Parcial:** límite de 1 MB por cuerpo (`main.ts:30`). **Sin límite de tasa** | Sin prueba |
| W8 | R | No queda registro de qué entró ni cuándo | Las filas de `recepciones_webhook` con su marca de tiempo, purgadas | AISL-18 (purga) |

### 3.2 API REST con sesión, LC2 y LC3

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| R1 | S | Robo o reutilización del token de sesión | Cookie `httpOnly`, `Secure` y `SameSite=Lax`, guardada con hash. Sin caché de cookie | `identity.e2e-spec.ts` «la fila de `sesiones` guarda el hash…» y «presentar el hash… NO abre la sesión» |
| R2 | S | Fuerza bruta de contraseña u OTP | Límite por IP sin confiar en `x-forwarded-for`. El OTP tiene 3 intentos y vive 5 minutos | `identity.e2e-spec.ts` «sin proxy de confianza, rotar x-forwarded-for NO esquiva…»; `invitaciones.e2e-spec.ts` «a los 3 intentos fallidos…»; `limite-otp-redis.e2e-spec.ts` |
| R3 | S | Enumeración de correos | La misma respuesta para un correo inexistente y para una contraseña errónea | `identity.e2e-spec.ts` «no distingue un correo inexistente…»; `invitaciones.e2e-spec.ts` «un correo nuevo y uno que ya existe…» |
| R4 | T/E | Cambiar el tenant activo hacia una agencia ajena | Membresía validada bajo RLS. Una manipulación revoca la sesión | `identity.e2e-spec.ts` «un tenant_activo_id manipulado… da 401 y revoca la sesión» |
| R5 | E | La cabecera de tenant de desarrollo llega a producción | Solo vale con `APP_ENV=local` y sin cookie | `shared/tenant/tenant.middleware.spec.ts` «sin APP_ENV definido se ignora»; `identity.e2e-spec.ts` «en cualquier otro entorno se ignora» |
| R6 | E | Un asesor se invita como Dueño, o deja la agencia sin Dueño | Regla de inclusión de permisos y 409 `NO_PUEDE_DEJAR_SIN_DUENO` | `invitaciones.e2e-spec.ts` «invitarse a sí mismo con un rol superior da 403»; `inbox-visibilidad.e2e-spec.ts` «la agencia nunca se queda sin un Dueño activo» |
| R7 | I | IDOR sobre la conversación de otro asesor o de otra agencia | Un único filtro de visibilidad y RLS. 404 igual que un id inexistente | `inbox-visibilidad.e2e-spec.ts` CA3, CA4 y «Bruno (otra agencia…) no ve nada de A» |
| R8 | I | Un asesor ve el neto o el margen | `autorizarMargen()`: 403 sin el permiso | `identity.e2e-spec.ts` «un asesor con incluirMargen=true recibe 403»; `quoting/paquetes-sin-margen.e2e-spec.ts` |
| R9 | T | El cliente manda importes manipulados | El servidor recalcula. Contratos `.strict()` y versiones inmutables | AISL-49 y AISL-50; `quoting/cotizaciones.e2e-spec.ts` |
| R10 | T | CSRF sobre las rutas de negocio (`POST` de mensajes, asignación, baja, invitaciones) | **Parcial:** `SameSite=Lax` y CORS. El chequeo de `Origin` (`shared/red/origen.ts`) solo corre en las rutas de `auth` y en el socket. `Lax` no frena a un subdominio hermano de `<dominio>` | Sin prueba en las rutas de negocio |
| R11 | D | Agotar la API o la base con consultas caras (búsqueda `ILIKE`, listados) | **Sin control:** no hay límite de tasa fuera de `auth` | — |
| R12 | R | Un asesor niega haber leído o cambiado un dato, o nadie sabe quién vio un pasaporte | **Sin control:** `registros_auditoria` existe en el esquema, pero ningún código de `apps/` la escribe. Incumple «acceso auditado» de R10 | — |

### 3.3 Gateway Socket.IO (`bandeja-en-vivo.gateway.ts`), LC2

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| S1 | S | Conectarse sin sesión, con una cookie falsa o desde un sitio ajeno | Cookie validada en el handshake y `Origin` exigido | `inbox-tiempo-real.e2e-spec.ts` «sin cookie, se rechaza», «una cookie falsa se rechaza» y «un Origin que no es la web se rechaza» |
| S2 | E | Unirse a la sala de otra agencia o de otro usuario | El servidor asigna las salas y `unirse` no da ninguna capacidad | `inbox-tiempo-real.e2e-spec.ts` «un cliente que pide unirse a la sala de otra agencia es rechazado…» |
| S3 | I | Recibir eventos de otra agencia o de una conversación no visible | Emisión por `usuario:<id>` tras leer bajo RLS | `inbox-tiempo-real.e2e-spec.ts` «con la cookie de A no se reciben eventos de B»; `inbox-visibilidad.e2e-spec.ts` CA6 |
| S4 | E | Un socket sobrevive a la baja, a la revocación o a la suspensión | Revalidación cada 60 s y cierre inmediato por `identity.acceso_revocado` | `inbox-tiempo-real.e2e-spec.ts` «con la sesión revocada…» y «identity.acceso_revocado cierra los sockets…» |
| S5 | D | Abrir miles de sockets con una sesión válida | **Sin control:** no hay límite de conexiones por usuario | — |

### 3.4 Trabajador y Redis, LC5

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| T1 | I | Redis expone PII (trabajos, pub/sub, `failedReason`) | Los trabajos y eventos llevan solo identificadores. Los errores, solo `Clase:código`. La carga de correo va cifrada | `inbox-bullmq.e2e-spec.ts` «encola… sin contenido» y «failedReason solo Clase:código»; `inbox-tiempo-real-redis.e2e-spec.ts` «el texto del viajero y su teléfono NO pasan por Redis» |
| T2 | T | Un evento falso publicado en Redis provoca una emisión cruzada | La API valida el contrato y vuelve a leer el mensaje bajo RLS del tenant del evento | `inbox-tiempo-real.e2e-spec.ts` «un evento cuyo mensaje no existe en SU tenant no se emite»; `inbox-tiempo-real-redis.e2e-spec.ts` «un mensaje de Redis que no cumple el contrato se descarta» |
| T3 | T | Un trabajo reencolado o duplicado repite efectos | `jobId` determinista, idempotencia por `wamid` y un turno del barrido con `SET NX` | `inbox-relay.e2e-spec.ts` «procesar dos veces el mismo change…»; `inbox-barrido.e2e-spec.ts` «dos barridos concurrentes dejan UN solo trabajo» |
| T4 | S | Acceso a Redis desde fuera | **Parcial:** solo la red privada de Render (ADR-0013, no desplegado). El código no exige credencial ni TLS | Sin prueba |
| T5 | D | El desalojo de claves pierde trabajos en silencio | `noeviction` (ADR-0013) y el barrido de pendientes cada 30 s | `inbox-barrido.e2e-spec.ts` «el encolado falló: el barrido lo reencola…» |

### 3.5 Base de datos y roles, LC4

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| B1 | E | Un proceso arranca con un rol que se salta RLS o con el rol equivocado | Guardia de rol al arrancar: identidad, superusuario y `BYPASSRLS` | `apps/api/src/shared/prisma/guardia-de-rol.spec.ts`; AISL «el rol de aplicación NO puede saltarse RLS» |
| B2 | I/T | Lectura o escritura cruzada por un `WHERE` olvidado | RLS forzada con `USING` + `WITH CHECK` canónicos y cero filas sin contexto | AISL-17, AISL-35, AISL-36 y AISL-37; AISL «sin contexto de tenant no se ve absolutamente nada» |
| B3 | T | Una FK simple enlaza filas de dos agencias | FK compuestas, con una migración que aborta si queda alguna simple | AISL-54, AISL-29 y AISL-51 |
| B4 | E | Funciones `SECURITY DEFINER` mal acotadas | `search_path` vacío, `EXECUTE` a un solo rol y una matriz exacta | AISL-12, AISL-13 y AISL-20 |
| B5 | E | Un rol de login crea objetos o lee el directorio | Privilegios declarados, comparados en ambos sentidos | AISL-8, AISL-9, AISL-10, AISL-21 y AISL-62 |
| B6 | I | Una credencial `viajapro_app` filtrada fija cualquier `app.current_tenant` y lee todas las agencias | **Sin control** para el texto de los mensajes (en claro). Lo cierra ADR-0014 (Propuesto) | — |
| B7 | I | Copias de Neon (ramas, PITR) con PII real | **Parcial:** staging nace solo con el esquema (ADR-0013). Sin cifrado de aplicación del texto | Sin prueba |
| B8 | T/D | El arnés de mutaciones se ejecuta contra una base compartida | Aborta sin `VIAJAPRO_BASE_DESECHABLE=1` (`packages/database/scripts/guarda-base-desechable.mjs`) | `packages/database/tests/guarda-mutaciones.spec.ts` |

### 3.6 Correo saliente (Postmark), LC6

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| C1 | I | Los logs o los errores filtran el destinatario o el contenido | Solo se registra el `ErrorCode`, sin `cause` | `apps/api/src/modules/notifications/correo-postmark.spec.ts` «un 422 se registra con ErrorCode…, sin Message, destinatario ni contenido» |
| C2 | S | Arrancar sin token cae en silencio a Mailpit | Aborta al arrancar | `correo-postmark.spec.ts` «postmark sin token aborta…» |
| C3 | I | Postmark retiene los OTP y los enlaces de invitación | **Sin control:** el Retention Add-on está pendiente del propietario. Mitigado por la caducidad: 5 min el OTP y 72 h la invitación | `invitaciones.e2e-spec.ts` «un token caducado se rechaza» |
| C4 | S | Alguien suplanta nuestro dominio de envío (phishing a los asesores) | **Sin control:** faltan DKIM, Return-Path y DMARC (dominio pendiente) | — |
| C5 | T | Reintentos que duplican correos | Reintento solo ante 5xx, 429 o timeout, con una clave de trabajo única | `notifications-bullmq.e2e-spec.ts` «un trabajo por clave…» |

### 3.7 Web (Next.js), LC2

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| F1 | T/I | XSS a partir del texto del viajero | Escapado de React. No hay `dangerouslySetInnerHTML` en `apps/web` | Sin prueba específica |
| F2 | T/I | Clickjacking o inyección sin cabeceras defensivas | **Sin control:** no hay CSP, `frame-ancestors` ni `X-Frame-Options` en `apps/web` | — |
| F3 | I | La web muestra el neto o el margen sin el permiso | **Parcial:** la API lo niega (R8), pero `reportes/page.tsx` y `ficha-detalle-paquete.tsx` lo pintan con datos simulados (tarea 0c.27) | Sin prueba en la web |
| F4 | I | Fallos de la API disfrazados con datos simulados | Un error visible y nunca respaldo silencioso (v0.36.1) | Pruebas de estado de `apps/web` (tarea 0c.34) |

### 3.8 CI/CD y despliegue en Render, LC7

| ID | S T R I D E | Amenaza | Control | Prueba |
|---|---|---|---|---|
| D1 | T/E | Un commit llega a `main` sin compuertas | **Parcial:** hooks locales (`.claude/hooks/guard-rama.mjs`). **No hay protección de rama en el servidor** | — |
| D2 | I | Secretos en el repositorio | `gitleaks` en el job `secretos`, con una sola huella ignorada | Job `secretos` de `.github/workflows/ci.yml` |
| D3 | T | Cadena de suministro: dependencias o Actions comprometidas | **Parcial:** `--frozen-lockfile`. Las Actions van fijadas por etiqueta (`@v4`), no por SHA. No hay `permissions` por defecto a nivel de workflow (solo en `secretos`) ni `pnpm audit` | — |
| D4 | E | Migraciones aplicadas desde una rama sin integrar | Solo `migrate deploy` desde `main`, en un Environment limitado (ADR-0013, no implementado) | AISL-11 detecta la divergencia con el repo |
| D5 | S/E | Un *deploy hook* filtrado redespliega | Un hook por servicio. Solo redespliega lo que ya está en `main` | — |
| D6 | R | No queda constancia de quién integró ni desplegó | **Parcial:** un registro por integración en `docs/_integraciones/AAAA-MM-DD-<versión>.md`, los commits `merge --no-ff` de `main` y el historial de Actions. `registro-de-autorizaciones.log` **no está versionado en `main`**, así que no sirve de evidencia | — |

## 4. Lo que está «sin control», por gravedad

1. **B6:** el texto de los mensajes en claro ante una credencial o una copia de la base. Es P1 y
   bloquea el primer mensaje de producción. Lo cierra ADR-0014.
2. **R12:** no hay auditoría de acceso a PII. Incumple R10 de forma literal. Dueños: `backend` y
   `auditor-seguridad`.
3. **D1 y D3:** `main` sin protección en el servidor y Actions sin fijar por SHA. Un token de
   GitHub comprometido escribe en producción. Dueños: el propietario y `devops`.
4. **R10:** CSRF desde un subdominio hermano. Se cierra extendiendo `origenEsDeConfianza` a todo
   método no seguro con cookie. Dueño: `backend`.
5. **F2:** sin cabeceras de seguridad en la web. Dueño: `frontend`.
6. **W7, R11 y S5:** sin límite de tasa ni de conexiones fuera de `auth`. Dueño: `backend`.
7. **C3 y C4:** retención en Postmark y DNS de correo sin configurar. Dueño: el propietario.

## 5. Mantenimiento

- Toda superficie nueva (pagos, media de WhatsApp, IA, salientes) añade su tabla **antes** de
  integrarse.
- Toda fila con «Sin prueba» que sea de aislamiento entre agencias es bloqueante (§3.1 de
  `CLAUDE.md`). Las demás van a la cola de `ESTADO.md` con dueño.
- Si una prueba citada se renombra, se actualiza esta tabla en el mismo commit.
