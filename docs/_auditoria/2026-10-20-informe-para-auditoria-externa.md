# ViajaPro: informe completo para auditoría externa

| Campo | Valor |
|---|---|
| Fecha del informe | 2026-10-20 |
| Estado auditado | `main` en `3a1369a`, última versión etiquetada **v0.38.0** |
| Repositorio | `github.com/Alfavear/CRM`, privado |
| Preparado por | Claude Opus 5.5, la sesión que orquesta los agentes del proyecto |
| Destinatario | Una herramienta o un equipo externo que audite seguridad, arquitectura, calidad y proceso |

## 0. Cómo leer este documento

- Este informe **describe** el sistema y **dice qué está verificado y qué no**. No sustituye al código:
  cada afirmación importante lleva la ruta del archivo o el ADR que la respalda, para que se pueda
  comprobar.
- Las **fuentes de verdad**, en orden de autoridad, son `ESTADO.md`, los ADR (`docs/03-adr/`), la
  bitácora (`docs/_bitacora/`) y los registros de integración (`docs/_integraciones/`). Si este informe
  contradice al código, gana el código y el informe tiene un error.
- La §15 reúne **lo que no está verificado** y la §16 **los hallazgos de documentación**, es decir, los
  lugares donde los documentos dicen algo falso o desactualizado. Son el mejor punto de partida para
  quien quiera poner a prueba este informe.
- Durante este periodo **nada se desplegó en un servidor**. Todo lo que dice «funciona» se refiere a
  pruebas en el CI, contra un PostgreSQL 16 y un Redis 7 limpios, a pruebas e2e contra la base
  compartida de Neon o a ejecuciones locales.

---

## 1. Qué es el producto

**ViajaPro** (nombre técnico provisional; el comercial **no está decidido**) es un **SaaS
multi-agencia**: un CRM vertical para **agencias de turismo en Colombia**, con **WhatsApp Cloud API**
como canal nativo. El dominio del turismo forma parte del núcleo del modelo: paquetes, vigencias,
tarifas netas del mayorista, cotizaciones, archivos de viaje y pasajeros.

- **Primer cliente:** la agencia que revende paquetes turísticos, con una piloto real (Agencias André's
  Tours) cuyo catálogo está sembrado: 33 paquetes, 78 vigencias y 79 tarifas. Los netos del mayorista
  son **derivados** (venta ÷ 1,20), no datos reales.
- **Mercado base:** Colombia (COP, Ley 1581 de 2012, TRM).
- **Documentos de producto:** `docs/00-vision/`, `docs/01-producto/` y el glosario
  `docs/01-producto/02-lenguaje-ubicuo.md`, que es obligatorio. El código usa los nombres del dominio
  en inglés o en español tal como los define el glosario.

## 2. Estado en una tabla

| Área | Estado a v0.38.0 | Verificado cómo |
|---|---|---|
| Recepción de WhatsApp (webhook → trabajador → bandeja) | Completa en la API | e2e en el CI con Postgres y Redis reales; e2e contra Neon |
| Bandeja en tiempo real (Socket.IO) | Completa en la API; **la web aún no la consume** (tarea 0c.35) | e2e en el CI, 19 pruebas contra Redis real |
| Autenticación (ADR-0011) | Rebanadas 1, 2 y 4 integradas; **falta la 3, la pantalla de ingreso conectada** | e2e en el CI |
| Visibilidad por asesor | Completa (CA1–CA17) | e2e en el CI, 31 pruebas |
| Cotizaciones con versiones inmutables | Completa: esquema, API, listado y estados | e2e contra Neon y en el CI |
| Política de precio y margen (R10) | Ninguna ruta entrega neto ni margen sin el permiso | e2e con sesión: asesor 403, dueño 200 |
| Correo transaccional | Adaptador Postmark listo; **sin cuenta ni dominio**: nunca se ha llamado a Postmark real | Unitarias con `fetch` simulado |
| Web (Next.js) | Integrada entera; parte de las pantallas aún usa datos simulados detrás de un interruptor | Lint, typecheck y 227 pruebas; capturas a 375 px |
| CI (GitHub Actions) | En verde; 8 jobs | Runs con URL en `ESTADO.md` |
| Despliegue | **Decidido (ADR-0013), no ejecutado** | — |
| Pagos, reservas, IA, analítica | **No empezado** | — |

---

## 3. Arquitectura

### 3.1 Stack (ADR-0001)

TypeScript estricto (`strict`, `noUncheckedIndexedAccess`) sobre Node 22. Monorepo con pnpm y
Turborepo.

| Paquete | Qué es |
|---|---|
| `apps/api` | NestJS, monolito modular (ADR-0004). **El trabajador vive aquí** como proceso aparte (`src/worker.ts`, `src/worker.module.ts`), según el ADR-0010 |
| `apps/web` | Next.js 15 (App Router), Tailwind 4, TanStack Query |
| `apps/worker` | **Vacío** a propósito: lo explican el ADR-0010 y `CLAUDE.md` §5 |
| `packages/contracts` | Esquemas Zod: la **única fuente de los tipos** compartidos entre la API y la web (R3) |
| `packages/domain` | Objetos de valor y lógica pura: `money`, `ocupacion`, `precio-de-venta`, `resolucion-de-tarifa` |
| `packages/database` | `schema.prisma`, 22 migraciones, políticas RLS, semillas, la suite de aislamiento y el arnés de mutaciones |

**Datos:** PostgreSQL gestionado en Neon (ADR-0007), región `us-east-2`. **Colas y tiempo real:**
Redis con BullMQ y Socket.IO.

### 3.2 Procesos

| Proceso | Rol de PostgreSQL | Qué hace |
|---|---|---|
| API (`apps/api`, `main.ts`) | `viajapro_app` | REST, webhook de Meta, gateway Socket.IO y Better Auth |
| API, conexión de identidad | `viajapro_identidad` | Solo las tablas globales de identidad (ADR-0011) |
| API, conexión de altas | `viajapro_altas` | Alta de canales y cuentas de WhatsApp |
| Trabajador (`worker.ts`) | `viajapro_webhook` | Consume BullMQ (`ProcesarChange`), relay del outbox, barrido de pendientes cada 30 s y cola de correo |
| Migraciones | `neondb_owner`, el propietario | Solo `migrate deploy` desde `main` (ADR-0013). **Nunca en un proceso de aplicación** |

**R2:** cada proceso **aborta al arrancar** si su rol no es el esperado, si es superusuario o si tiene
`BYPASSRLS`. Lo implementa `guardia-de-rol.ts`, más la guardia propia de `viajapro_identidad`, que
comprueba además que no tenga privilegios de negocio.

### 3.3 Módulos (contextos delimitados) presentes en `apps/api/src/modules/`

`crm`, `identity`, `inbox`, `notifications` y `quoting`. Los módulos **no se importan entre sí** (R4):
se comunican por **puertos** cuyos tokens están en `shared/puertos/`. Desde v0.30.1, `inbox` y
`quoting` piden a `crm` por puertos (`asegurarContacto`, `existeContacto` y
`existeOportunidadDelContacto`) que corren dentro de la transacción del llamador. El CI lo vigila con
el job `fronteras` (`scripts/verificar-fronteras.mjs`).

Los contextos previstos sin empezar son `booking`, `payments`, `automation`, `analytics` y `audit`.

### 3.4 Despliegue decidido, no ejecutado (ADR-0013)

Todo irá en **Render, región Ohio**, junto a Neon `us-east-2`: la web, la API con Socket.IO, el
trabajador como *background worker* y un Key Value (Redis) con `noeviction` accesible solo por red
privada.

- **Por qué no Vercel para la API:** sus WebSockets están en beta con cortes entre 300 y 1800 s, y no
  admite procesos continuos. Fuente citada en el ADR: vercel.com/docs, consultado el 2026-10-20.
- **Dominios:** `app.<dominio>` para la web y `api.app.<dominio>` para la API, con la cookie en
  `Domain=app.<dominio>`. El webhook de Meta queda en `https://api.app.<dominio>/webhooks/whatsapp`.
- **Migraciones:** desde GitHub Actions, en el Environment `staging` limitado a `main`. El despliegue
  usa *deploy hooks* por servicio, no la clave de API de la cuenta.
- **Neon:** la rama de staging se crea **solo con el esquema** y se siembra; nunca es copia de
  producción.
- **Decisión del propietario:** empezar **solo por staging**, a unos USD 51 al mes. Producción se estima
  en USD 142–177 al mes, sin contar Postmark ni S3.
- **Estado:** `devops` prepara el *blueprint* (`render.yaml`), las imágenes y el workflow en la rama
  `ci/despliegue-staging-render`, sin integrar a la fecha de este informe.

---

## 4. Multi-tenancy y aislamiento entre agencias

El aislamiento es el riesgo número uno del producto: una fuga entre agencias mata el producto. Ver
ADR-0003, ADR-0008, ADR-0010 y ADR-0011.

### 4.1 Mecanismo

- **Esquema compartido** con `tenant_id` en toda tabla de negocio y **RLS forzada**. Las políticas se
  generan con `aplicar_aislamiento_tenant()` y llevan `USING` + `WITH CHECK`.
- El contexto se fija **por transacción** (`set_config('app.current_tenant', …, true)`) dentro de
  `conTenant` o `conTenantResuelto`, y se lee de vuelta antes de escribir. Sin contexto, RLS devuelve
  **cero filas**: migración `20261007042518_rls_sin_contexto_cero_filas`.
- **Excepciones a RLS** como dato en la base, en la tabla `excepciones_rls` (R1), con un `motivo`
  obligatorio. Añadir una excepción exige editar también el literal de la suite de aislamiento.
- **Claves foráneas compuestas** `(x_id, tenant_id)` en todo el esquema. Desde v0.31.0 una migración
  barre el catálogo y **aborta si queda alguna FK simple** entre tablas con tenant. Motivo: la
  integridad referencial se evalúa por encima de RLS.
- **El tenant de la sesión** (ADR-0011) sale solo de la sesión verificada en el servidor y se revalida
  **en cada petición** leyendo `usuarios` bajo RLS (paso 4). También se comprueba la agencia
  suspendida. La cabecera de tenant de desarrollo solo vale con `APP_ENV=local` **y sin cookie**.
- **Webhook entrante** (ADR-0008 y ADR-0010): el tenant **nunca sale del payload**. Se resuelve por
  `phone_number_id` en un directorio con HMAC y pimienta (`resolver_enrutamiento`). Escribir exige
  **a la vez** que el directorio y `canales` digan `ACTIVO` (`procesar-change.ts:95`), y el canal se lee
  con `FOR SHARE`.

### 4.2 Roles de PostgreSQL

Los roles de aplicación son `viajapro_app`, `viajapro_altas`, `viajapro_webhook` y `viajapro_identidad`
(R2, actualizada el 2026-10-19 con aprobación del propietario). Además existen:

- `viajapro_accesos`: `NOLOGIN`, dueño del disparador de `accesos_identidad`;
- `viajapro_staging` y `viajapro_enrutador`: dueños de funciones `SECURITY DEFINER`;
- `viajapro_reportes`: mencionado en las migraciones.

**Ningún rol de login es miembro de `viajapro_accesos`**, y hay una aserción sobre `pg_auth_members`
que lo comprueba.

### 4.3 Funciones `SECURITY DEFINER` y funciones privilegiadas

La matriz de la aserción 20 cuenta **12 funciones `SECURITY DEFINER`**. Todas llevan `search_path`
vacío, `EXECUTE` revocado a `PUBLIC` y concedido a un único rol.

Funciones definidas en las migraciones, para cotejar con la matriz:

- **Enrutamiento:** `registrar_enrutamiento`, `resolver_enrutamiento`, `propagar_estado_canal` y
  `propagar_estado_cuenta`.
- **Recepciones y payloads:** `registrar_recepcion`, `tomar_recepcion`, `anular_payload`,
  `purgar_payloads` y `purgar_recepciones`.
- **Barrido:** `listar_changes_pendientes` y `contar_reencolado_barrido`.
- **Identidad:** `sincronizar_acceso_identidad`.
- **Cotizaciones:** `versiones_cotizacion_inmutables` y `versiones_cotizacion_validar_alta`, que son
  disparadores de inmutabilidad.
- **Mantenimiento:** `aplicar_aislamiento_tenant`, `aplicar_privilegios_declarados`,
  `politica_canonica_tenant` y `crear_particion_historial`. Esta última **no** es `SECURITY DEFINER` y
  usa SQL dinámico sin entrada de usuario.

> **Para el auditor:** comprobar que las 12 de la matriz son exactamente las `SECURITY DEFINER` reales
> con `SELECT proname FROM pg_proc WHERE prosecdef`. Si no coinciden, es un hallazgo.

### 4.4 Pruebas de aislamiento

- **Suite:** `packages/database/.../aislamiento.spec.ts`, con 71 bloques `it` y las aserciones
  numeradas hasta la 66 o más. Corre en el job `aislamiento-tenants` del CI sobre un Postgres 16
  limpio, con **las 22 migraciones reconstruidas desde cero** en cada corrida.
- **Arnés de mutaciones:** `mutaciones-aislamiento.mjs` rompe a propósito políticas, FK y privilegios
  para demostrar que la suite se pone en rojo. **Desde v0.30.0 aborta** si no hay
  `VIAJAPRO_BASE_DESECHABLE=1` y una base desechable (`scripts/guarda-base-desechable.mjs`). Motivo:
  el incidente de la §12.
- **Regla del proyecto:** una aserción nueva tiene que **verse en rojo** antes del arreglo. Los run ids
  del rojo y del verde constan en los registros de integración.

---

## 5. Flujos de punta a punta

### 5.1 Recepción de WhatsApp

1. **`GET /webhooks/whatsapp`:** el apretón de manos de Meta, con `hub.verify_token` comparado en tiempo
   constante.
2. **`POST /webhooks/whatsapp`:**
   - firma HMAC-SHA256 sobre el **cuerpo crudo** con `META_APP_SECRET`; si no es válida, 403;
   - el sobre se guarda **cifrado** (AES-GCM, `WEBHOOK_PAYLOAD_KEY` con versión) **antes** de saber el
     tenant;
   - la respuesta es la misma para un número conocido y uno desconocido.
3. **Encolado:** un trabajo BullMQ por *change*, con `jobId = <recepcion hex>-<indice>` para la
   idempotencia de R5. Solo lleva `{recepcionId, indice}`, sin PII.
4. **`ProcesarChange`, en el trabajador:**
   - resuelve el tenant con el directorio;
   - comprueba la conjunción directorio + `canales`;
   - escribe contacto (por el puerto de `crm`), conversación, mensaje y outbox bajo RLS;
   - el mensaje es idempotente por `(tenant_id, wamid)`;
   - anula el payload.
   - Un número desconocido o revocado se cierra como `CLASIFICADO` sin filas de negocio.
5. **Barrido:** cada 30 s reencola los *changes* `PENDIENTE` (`listar_changes_pendientes`), con un tope
   de reencolados que se cuenta en la base. Toma el turno con `SET NX` en Redis.
6. **Tiempo real:** el relay del outbox publica por Redis pub/sub **sin el texto**. La API lee el
   mensaje bajo RLS y lo emite **por usuario** (`usuario:<id>`) solo a quien puede ver esa conversación,
   según la §5.3. Con la reasignación llega el evento `CONVERSACION_RETIRADA`.
7. **Errores:** el `failedReason` y los logs llevan solo `Clase:código`, nunca el mensaje del error
   (R10, v0.21.2).

**No implementado:** acuses de entrega (`statuses`, que se descartan), descarga de media y envío de
mensajes salientes a WhatsApp.

### 5.2 Autenticación (ADR-0011)

- **Better Auth autoalojado** en el módulo `identity`, con conexión propia como `viajapro_identidad`.
  Cookie opaca `httpOnly`, `SameSite=Lax`, `session.cookieCache` desactivado y `disableSignUp`: solo se
  entra por invitación.
- **El token de sesión se guarda con hash** (`sha256:<hex>`) mediante un adaptador que envuelve el de
  Prisma, porque Better Auth no lo hace de forma nativa. Una e2e lee la fila con SQL.
- **OTP por correo:** Email OTP con `storeOTP: 'hashed'`, válido 5 minutos y con 3 intentos. Tiene
  límite por IP (429) y por correo (3 cada 15 minutos, con un 200 silencioso para no revelar si el
  correo existe). Los contadores van en Redis con una clave HMAC y TTL, probados contra Redis real.
- **Invitaciones:** token de un solo uso con hash en `verificaciones`, que **caduca a las 72 horas**. El
  rol invitado tiene que estar **incluido** en los permisos de quien invita (`permisoQueFalta`).
  Aceptar **nunca cambia el rol** de un miembro vigente.
- **Baja de miembros:** con la misma regla de inclusión. **La agencia nunca se queda sin Dueño** (409
  `NO_PUEDE_DEJAR_SIN_DUENO`). Nadie puede darse de baja a sí mismo. La baja emite
  `identity.acceso_revocado`, que cierra los sockets.
- **Límite de intentos de inicio de sesión:** por `req.ip`, con `API_TRUST_PROXY` (por defecto
  ninguno). `x-forwarded-for` **no** se reenvía.
- **Socket.IO:** el handshake aplica los pasos 3 y 4 sobre la cookie y valida `Origin`. Revalida cada
  60 s y cierra tras 3 fallos seguidos de infraestructura (`SOCKET_REVALIDACION_MAX_FALLOS`); una
  sesión inválida cierra al momento.
- **Rutas:**
  - `POST /api/v1/auth/sign-in/email`, `POST /api/v1/auth/sign-out` y `GET /api/v1/auth/session`;
  - `POST /api/v1/auth/tenant-activo`, que exige `Origin` y valida la membresía bajo RLS;
  - `POST /api/v1/auth/otp/enviar` y `POST /api/v1/auth/otp/iniciar-sesion`;
  - las invitaciones y `POST /api/v1/identidad/miembros/:id/baja`.

### 5.3 Visibilidad de conversaciones

Regla en `docs/01-producto/12-visibilidad-de-conversaciones.md`. Quien no tiene
`conversaciones.ver_todas` ve solo las conversaciones **asignadas a él** y las **no asignadas** (la cola
común). El permiso sale del rol en la base y se aplica en un **único filtro** para la REST, la
búsqueda, los contadores y el socket.

- Una conversación ajena da **404**, igual que un id inexistente, para que no se pueda enumerar.
- Responder por primera vez asigna la conversación.
- Al dar de baja a alguien, sus conversaciones vuelven a la cola común.
- Por defecto solo el rol Dueño tiene `ver_todas`. Para que en una agencia todos vean todo, se da ese
  permiso al rol de asesor.

### 5.4 Cotizaciones (ADR-0009)

- **Vigencias y tarifas:** la salida programada es una vigencia de un solo día. Hay una sola función de
  resolución con desempate: gana lo más específico, y un empate es un error de datos.
- **Política de precio por agencia:** neto del mayorista + 20 % **sobre el neto** por defecto, con
  redondeo a 1.000, en la tabla `politicas_de_precio`.
- **Guardar:** el **servidor recalcula** y nunca guarda importes del cliente; los contratos de entrada
  son `.strict()`. Las **versiones son inmutables**: un disparador rechaza `UPDATE`, `DELETE` y
  `TRUNCATE`, salvo la purga de tenant por el rol propietario.
- **Estados:** BORRADOR → ENVIADA → ACEPTADA, RECHAZADA o VENCIDA. Un estado terminal no admite
  versión nueva (409).
- **R10:** neto, margen, porcentaje y base **solo** viajan con `incluirMargen=true` **y** el permiso
  «ver neto y margen» (`autorizarMargen()`). Si falta el permiso, 403. El listado rechaza
  `incluirMargen` con 400.
- **Dinero:** enteros en la **unidad mínima** de la moneda (en COP, el peso) con código ISO-4217
  (R8).

### 5.5 Correo transaccional (ADR-0012)

- **Postmark**, llamado por HTTP con `fetch`, sin SDK, desde el adaptador `CorreoPostmark` de
  `PuertoCorreo`. El proveedor se elige con `MAIL_PROVIDER`: `mailpit` en local, un doble en el CI y
  `postmark` en producción.
- **Sin `POSTMARK_SERVER_TOKEN`**, la API y el trabajador abortan al arrancar. No hay respaldo
  silencioso a Mailpit.
- **Reintentos:** la cola los hace solo ante 5xx, 429 y timeout; nunca ante 4xx. Está marcado en el
  código como **inferencia**, no como política oficial.
- **Logs:** solo el `ErrorCode` de Postmark, nunca el campo `Message` ni el destinatario.
- **Carga de la cola:** cifrada con AES-GCM (`CORREO_PAYLOAD_KEY`), con `removeOnFail`.
- **Envío:** desde un **dominio técnico neutro**, decisión del propietario.

---

## 6. Superficie de la API

| Prefijo | Rutas |
|---|---|
| `salud` | `GET listo` |
| `webhooks/whatsapp` | `GET` (verificación) y `POST` (firma HMAC) |
| `api/v1/auth` | `sign-in/email`, `sign-out`, `session`, `tenant-activo`, `otp/enviar` y `otp/iniciar-sesion` |
| `api/v1/auth/invitaciones` e `identidad/invitaciones` | crear y `aceptar` |
| `api/v1/identidad/miembros` | `POST :id/baja` |
| `api/v1/conversaciones` | listado, `:id`, `:id/mensajes` (GET y POST), `:id/notas` (GET y POST), `:id/adjuntos/:adjuntoId`, `:id/leida`, `:id/asignacion` (PUT) y `contadores` |
| `api/v1/catalogo` | `salidas`, `cotizar`, `paquetes`, `paquetes/:id` y `paquetes/cotizar` |
| `api/v1/cotizaciones` | crear, `:id`, `:id/versiones`, `:id/estado` y el listado con cursor |
| `api/v1/crm` | `tablero`, `contactos`, `contactos/:id/ficha` y `oportunidades/:id/etapa` (PATCH) |
| Socket.IO | gateway `bandeja-en-vivo.gateway.ts`, con los eventos `MENSAJE_NUEVO` y `CONVERSACION_RETIRADA` |

> **Para el auditor:** listar las rutas reales con
> `grep -rhoE "@(Controller|Get|Post|Put|Patch|Delete)\(" apps/api/src`, comprobar que **toda** ruta de
> datos de agencia pasa por la sesión, salvo `salud`, `webhooks/whatsapp` y las rutas exactas de Better
> Auth (`RUTAS_SIN_TENANT`), y que toda ruta que acepta `incluirMargen` llama a `autorizarMargen()`.

## 7. Web (`apps/web`)

- **Páginas:** `/`, `/bandeja`, `/bandeja/[id]`, `/catalogo`, `/configuracion`, `/contactos`,
  `/cotizaciones`, `/cotizaciones/[id]`, `/cotizador`, `/iniciar-sesion`, `/pipeline`, `/reportes` y
  `/viajes`.
- **Interruptor `NEXT_PUBLIC_USE_REAL_CRM`:** apagado, la web usa datos simulados y lo avisa con un
  distintivo visible. Encendido, usa la API real. Desde v0.36.1, **un fallo de la API real es un error
  visible, nunca datos simulados** (tarea 0c.34).
- **Hecho:** catálogo y cotizador contra la API real; guardado de cotizaciones con versiones; listado de
  cotizaciones con cursor; estados vacío, carga y error; errores sin mensajes técnicos; foco y teclado
  en los modales; 375 px con capturas en `docs/_assets/diseno/`.
- **Pendiente** (cola de Antigravity en `traspaso/COLA.md`, rama `feat/bandeja-web`):
  - **0c.29:** el ingreso con la API real;
  - **0c.27:** neto y margen según el permiso, porque `reportes/page.tsx` muestra «Costo Neto» y
    «Margen» **sin control de rol**, con datos simulados;
  - **0c.35:** la bandeja contra la REST real y el socket.

## 8. Contratos y dominio

- **`packages/contracts/src/`:** `catalogo`, `comunes`, `cotizaciones`, `crm`, `identidad`, `inbox`,
  `plantillas`, `politica-de-precio` y `vigencias`. La web importa de aquí: **cero tipos de dominio
  redefinidos** en `apps/web/src/lib/mock-*.ts`, verificado el 2026-10-19.
- **`packages/domain/src/`:** `money`, `ocupacion`, `precio-de-venta` y `resolucion-de-tarifa`, con sus
  pruebas.

---

## 9. Seguridad: reglas, controles y auditorías

### 9.1 Reglas del proyecto (`CLAUDE.md` §3)

| Regla | Qué exige |
|---|---|
| R1 | `tenant_id` y RLS en toda tabla de negocio; las excepciones van como dato en `excepciones_rls` |
| R2 | Nunca el rol `postgres`; cada proceso aborta si su rol no es el esperado |
| R3 | Contratos en Zod en un solo sitio |
| R4 | Sin imports entre módulos |
| R5 | Todo efecto externo es idempotente y pasa por cola |
| R6 | Ningún secreto en el repositorio |
| R7 | Toda decisión estructural lleva ADR |
| R8 | Dinero en enteros con código ISO-4217 |
| R9 | Fechas en UTC |
| R10 | La PII y los datos internos (neto, margen) se tratan como sensibles |
| R11 | Solo el `integrador` escribe en `main` |
| R12 | Se parametriza la política de negocio, nunca los invariantes |
| R13 | Una sola vuelta de revisión, salvo en aislamiento entre agencias |

### 9.2 Auditorías de seguridad hechas en este periodo

Todas las hizo el agente `auditor-seguridad`, leyendo el código y, cuando hacía falta, con lecturas en
Neon.

| Objeto | Veredicto | Hallazgos bloqueantes, todos corregidos antes de integrar |
|---|---|---|
| Trabajador del inbox (v0.21.0) | Aceptar | — (3 correcciones de cola: PII en logs, `FOR SHARE` y dos e2e) |
| Puertos hacia `crm` (v0.30.1) | Aceptar | — |
| Barrido (v0.30.0) | Aceptar | — |
| Huecos del disparador (v0.32.0) | Aceptar con cambios | `registrar_enrutamiento` se saltaba la comprobación en silencio si el canal era de otra agencia; ahora lanza `P0002` |
| ADR-0011, en dos vueltas | Aceptar con cambios | (1) la baja sobrevivía en el socket; (2) la superficie de `viajapro_identidad` estaba sin definir |
| Rebanada 1 de identidad | Aceptar | — |
| Rebanada 2 de identidad | Aceptar con un cambio | El rate limit tomaba el `x-forwarded-for` del cliente |
| Rebanada 4 (invitaciones y OTP) | Aceptar con un bloqueante | **Escalada:** quien tenía `usuarios.administrar` podía invitarse a sí mismo como Dueño |
| Bandeja en vivo | Aceptar | — |
| Visibilidad | Aceptar con un bloqueante | **Escalada:** se podía dar de baja al único Dueño |
| FK compuestas y aserción 17 | Aceptar | — |
| ADR-0010, ADR-0012 y ADR-0013 | Aceptar con cambios | Concreciones, no fallos de diseño |

### 9.3 Fugas de datos internos (R10) encontradas y cerradas

| Fuga | Corregida en |
|---|---|
| `VersionDeCotizacion.politica` viajaba siempre: con la venta y el porcentaje se deduce el neto | v0.24.1 |
| `POST /catalogo/paquetes/cotizar` y `GET /paquetes/:id` devolvían neto y margen siempre | v0.34.1 |
| `incluirMargen=true` no comprobaba ningún rol | v0.34.0 y v0.34.1 |
| La web caía a datos simulados en silencio cuando fallaba la API real, también al guardar | v0.36.1 |
| `error.message` de Prisma en logs y en Redis, con teléfono y texto del viajero | v0.21.2 |

**Abiertas** (sin usuarios reales y sin despliegue): «Neto:» en `ficha-detalle-paquete.tsx` y «Costo
Neto / Margen» en `reportes/page.tsx` se muestran sin control de rol, con datos simulados. Las cubre la
tarea 0c.27.

### 9.4 Secretos

- **Inventario (nombres, sin valores):** `META_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  `WHATSAPP_DIRECTORY_PEPPER` (con versión y anterior), `WEBHOOK_PAYLOAD_KEY` (con versión y anterior),
  `BETTER_AUTH_SECRET`, `CORREO_PAYLOAD_KEY`, `POSTMARK_SERVER_TOKEN`, `DATABASE_*_URL` (un rol por
  conexión) e `IDENTIDAD_DEV_PASSWORD` (solo local).
- **Generación local:** `scripts/generar-secretos-locales.ps1`, que copia el valor existente entre
  árboles, aborta si dos árboles tienen valores distintos y solo genera si no lo tiene ninguno. Antes
  podía pisar la pimienta buena; quedó corregido.
- **Escaneo:** `gitleaks` en el job `secretos` del CI. La lista blanca se reduce a literales de
  plantilla y a **una huella exacta** en `.gitleaksignore` (ver la §12, incidente 3).
- **Rotación pendiente del propietario:** la contraseña de Neon y la clave de API de Stitch, que se
  pegaron en un chat (`ESTADO.md`, tarea 11).

---

## 10. Calidad y CI

### 10.1 Pipeline (`.github/workflows/ci.yml`)

Jobs: `secretos` (gitleaks), `calidad` (matriz de typecheck, lint y build), `test`,
`aislamiento-tenants`, `fronteras` (R4), `hooks` (política de rama) y `commits` (convención; solo en
PR, así que aparece como *skipped* en `workflow_dispatch`).

- **Postgres 16 limpio** como service container: las 22 migraciones se aplican desde cero con
  `migrate deploy` y los roles de aplicación.
- **Redis 7** como service container. Las e2e de BullMQ, barrido, tiempo real y límite de OTP **corren
  de verdad** en el CI; en local se saltan avisando.
- Los secretos de prueba se **generan en el propio job** con `openssl`. No hay ningún secreto real en
  GitHub.
- **Desde el 2026-10-19 el CI es la compuerta de aislamiento**, en lugar de Neon compartido, por el
  incidente de la §12.

### 10.2 Cifras de la última integración que las reporta

- API: unos 366 bloques `it`. Web: 227 pruebas.
- Aislamiento: 71 `it`, con aserciones numeradas hasta la 66 o más.
- Contracts: 60. Domain: 70.

Cada registro de `docs/_integraciones/` lleva sus cifras y el run id del CI.

### 10.3 Compuertas del integrador (ADR-0005)

Hay siete etapas: procedencia, compuertas automáticas, compuertas del proyecto (RLS, secretos,
fronteras, contratos, migraciones, `any` y dinero), auditorías, hilo documental, integración con
`merge --no-ff` y una autorización registrada en `docs/_integraciones/registro-de-autorizaciones.log`,
y cierre.

Los hooks locales (`.claude/hooks/guard-rama.mjs` y `autorizar-integracion.mjs`) bloquean escribir en
`main` sin autorización de un solo uso. **No hay protección de rama en el servidor**, porque el plan
gratuito de GitHub no la permite en repos privados (`ESTADO.md`, tarea 10).

---

## 11. Proceso de ingeniería

- **Desarrollo con agentes especializados** definidos en `.claude/agents/`: arquitecto, backend, datos,
  frontend, qa, devops, auditor-seguridad, integrador, dueño de producto, investigador y otros. **Solo
  el `integrador` escribe en `main`** (R11). Cada agente trabaja en su rama y en un worktree propio:
  `CRM-api` y `CRM-inbox` para la API y los datos, y `CRM-bandeja` para la web.
- **Antigravity**, otra IA, construye `apps/web` en la rama `feat/bandeja-web` con el protocolo de
  traspaso por archivos (`traspaso/ENTREGA.md`, `REVISION.md` y `COLA.md`, en
  `docs/09-ia/06-flujo-con-antigravity.md`). Un revisor `frontend` acepta o devuelve cada entrega.
- **Modo desatendido:** del 2026-10-19 al 2026-10-20, un loop autónomo orquestó a los agentes. El
  propietario tomó las decisiones de producto y las de `CLAUDE.md`, y cada una quedó registrada
  **literalmente** en la bitácora (`docs/_bitacora/2026-10-19-decisiones-del-propietario-…`,
  `2026-10-20-decision-proveedor-de-correo.md` y `2026-10-20-decision-despliegue.md`).
- **Regla de parada (R13 y `CLAUDE.md` §3.1):** una vuelta de revisión, salvo en aislamiento; lo no
  bloqueante va a la cola de `ESTADO.md` con dueño.

## 12. Incidentes del periodo

| # | Qué pasó | Impacto | Corrección |
|---|---|---|---|
| 1 | **Mutaciones de esquema contra Neon compartido:** el arnés rompió a propósito una FK y apagó la RLS de `cotizaciones` durante unos 4 minutos. Lo corrieron un agente `datos` y el `integrador` en la v0.22.0, por instrucción de la sesión orquestadora | La suite de otras sesiones falló (aserciones 39, 47 y 48). **No se observó ninguna fila cruzada entre agencias.** No había usuarios ni app conectada | El arnés aborta salvo en una base desechable (`835d2a6`); el CI pasa a ser la compuerta de aislamiento; los agentes ya no aplican migraciones en Neon desde ramas sin integrar |
| 2 | Una migración de una rama sin integrar (`20261019230000_identidad…`) se aplicó en Neon antes de entrar en `main` | La aserción 11 salió roja para todas las ramas | Se resolvió al integrarla (v0.33.0): Neon y `main` coinciden en 22 migraciones |
| 3 | El `WHATSAPP_WEBHOOK_VERIFY_TOKEN` real estaba como literal en una prueba (`94bf78f`) y figuraba en la lista blanca de gitleaks como «falso positivo» | Quedó en el historial de un repo privado. Solo sirve para el apretón de manos `GET` | La prueba genera su token; el valor se rotó en los cuatro `.env`; Meta nunca lo tuvo, porque el webhook no está configurado; `.gitleaksignore` ignora solo esa huella |
| 4 | El shell del propietario tenía un `DATABASE_URL` global de otro proyecto (`TrastornadoresApp`), y `dotenv-cli` no lo sobrescribe | `limpiar-fixtures --borrar` se ejecutó contra esa base ajena y **no borró nada**, porque no existía la tabla `tenants` | Toda orden de base va con `env -u DATABASE_URL -u DIRECT_URL`. **Pendiente del propietario: quitar la variable global** |
| 5 | Un revisor sobrescribió `traspaso/COLA.md` con el contenido de `REVISION.md` (`0bededa`) | La cola de Antigravity quedó sin tareas | Restaurada en `04d269a` |
| 6 | Un script de PowerShell de la sesión dejó vacíos los hosts del `.env` de `CRM-inbox`: `return` no detiene un pegado línea a línea | Sin conexión en ese árbol | Restaurado desde la copia `.env.antes-de-rama` |

## 13. ADR

| ADR | Tema | Estado |
|---|---|---|
| 0001 | Stack tecnológico | Aceptado |
| 0002 | WhatsApp Cloud API, Embedded Signup y Tech Provider | Aceptado |
| 0003 | Multi-tenancy: esquema compartido y RLS | Aceptado |
| 0004 | Monolito modular | Aceptado |
| 0005 | Modelo de ramas e integrador | Aceptado |
| 0006 | Parametrización (política, no invariantes) | Aceptado |
| 0007 | PostgreSQL gestionado en Neon | Aceptado |
| 0008 | Resolución de tenant en webhooks | Aceptado; **supersedido en parte por el 0010** |
| 0009 | Vigencias, tarifas y política de precio | Aceptado |
| 0010 | El webhook tal como es y el trabajador en `apps/api` | Aceptado y ratificado |
| 0011 | Autenticación y tenant de sesión | Aceptado |
| 0012 | Correo transaccional: Postmark | Aceptado |
| 0013 | Despliegue: Render, Ohio, solo staging por ahora | Aceptado |

## 14. Historial de versiones del periodo (v0.18.0 → v0.38.0)

Cada versión tiene un registro en `docs/_integraciones/`. Aquí van las del 2026-10-19 y el 2026-10-20.

| Versión | Contenido |
|---|---|
| v0.19.0 | La suite de aislamiento deja de envenenarse; fixtures por corrida; `@Inject` explícito; carrera de turbo |
| v0.20.0 | Esquema del inbox |
| — | e2e del `POST` del webhook; ADR-0010 |
| v0.21.0 | Relay y trabajador `ProcesarChange` |
| v0.21.1 | Un canal revocado no se resuelve como activo (disparador) |
| v0.21.2 | Correcciones de la auditoría del trabajador |
| v0.22.0 | Esquema de cotizaciones con versiones inmutables |
| v0.23.0 | API de cotizaciones |
| — | CI en verde por primera vez; token de gitleaks |
| v0.24.0 | Web, tanda 1 (base) |
| v0.24.1 | R10: la política solo viaja con `incluirMargen` |
| v0.25.0 | Listado y estados de cotización |
| v0.26.0 – v0.28.0 | Web, tandas 2, 3 y 4, más el cotizador con guardado |
| — | BullMQ con Redis real en el CI; arreglo del script de secretos |
| v0.29.0 | Web: estados vacío, carga y error |
| v0.30.0 | Barrido de *changes* pendientes |
| v0.30.1 | Puertos hacia `crm` (R4) |
| v0.30.2 | Web: desbordes a 375 px |
| v0.31.0 | FK compuestas en todo el esquema; aserción 17 por columna |
| v0.31.1 | Web: listado de cotizaciones contra la API real |
| v0.32.0 | Huecos del disparador; tope del barrido en la base |
| — | ADR-0011 (integrado por orden directa del propietario con `/integrar`) |
| v0.33.0 | Identidad, rebanada 1 (esquema y roles) |
| v0.33.1 | Contador del barrido en la base |
| v0.34.0 | Identidad, rebanada 2 (módulo, sesión y 403 de margen) |
| v0.34.1 | R10 en el cotizador antiguo |
| v0.35.0 | Identidad, rebanada 4 (invitaciones y OTP) |
| v0.36.0 | Bandeja en vivo (Socket.IO) |
| v0.36.1 | Web: sin caída a datos simulados; errores limpios; pruebas de estado |
| v0.36.2 | Web: teclado y foco |
| v0.37.0 | Visibilidad de conversaciones por asesor; REST de conversaciones; baja de miembros |
| v0.37.1 | Socket cerrado tras N fallos; límite de OTP |
| — | e2e del límite de OTP con Redis real; ADR-0012 |
| v0.38.0 | Adaptador `CorreoPostmark` |
| — | ADR-0013 |

---

## 15. Lo que **no** está verificado

1. **Nada desplegado.** Ningún flujo se probó con tráfico real de Meta, de Postmark ni de usuarios.
2. **El webhook de Meta no está configurado** (Paso 2 de Meta), porque necesita una URL pública. La
   recepción solo se probó con payloads de ejemplo firmados con un secreto de prueba.
3. **Postmark nunca se ha llamado de verdad**; su política de reintentos es inferencia. El precio del
   Retention Add-on y el límite de tasa no se confirmaron.
4. **El tiempo real no se ha probado en un navegador real**: solo con `socket.io-client` en las e2e. La
   web todavía no lo consume.
5. **Las columnas de Better Auth** se escribieron según el ADR, porque en esa sesión no había acceso a
   la documentación. Las e2e de sesión pasan, pero no se cotejaron con la documentación oficial de su
   esquema.
6. **El cifrado y la rotación de la pimienta del directorio:** el ensayo de rotación (tarea 4c) **no se
   ha hecho**.
7. **La creación anual de particiones del historial** (tarea 4h) **no está automatizada**: si falta la
   del año siguiente, ninguna agencia puede conectar su canal.
8. **`purgar_directorio` no existe** (tarea 4g): ninguna fila del directorio se puede borrar por ningún
   camino de código.
9. **La retención y supresión de datos personales (Ley 1581)** no tienen procedimiento implementado
   para identidades ni para `accesos_identidad`. **Falta la revisión legal.**
10. **El aviso de privacidad para asesores y viajeros** no está escrito.
11. **`mensajes.texto` se guarda sin cifrar** y con un índice trigram para la búsqueda. Puede contener
    números de pasaporte (R10). Está anotado como decisión pendiente de ADR antes del primer mensaje de
    producción.
12. **Protección de `main` en el servidor:** no existe.
13. **Una prueba intermitente:** la aserción 22 tuvo bloqueos mutuos con DDL ajeno; con el arnés en
    paralelo se acotó con `pg_advisory_xact_lock`.

## 16. Hallazgos de documentación (el documento dice algo falso o viejo)

| Dónde | Qué dice | La realidad |
|---|---|---|
| `ESTADO.md`, cabecera, «Avance de la fase» y «Próximo hito» | «Bandeja web en construcción»; próximo hito: «el trabajador que convierte un `change`…» | El trabajador entró en v0.21.0 y la bandeja web está integrada. La cabecera no se actualizó desde el 2026-10-19 |
| `.env.example` | `AUTH_JWT_ACCESS_SECRET`, `AUTH_JWT_REFRESH_SECRET`, `AUTH_*_TOKEN_TTL`, `AUTH_GOOGLE_*` y `ENCRYPTION_MASTER_KEY` | La sesión es una cookie opaca de Better Auth (ADR-0011); no hay JWT ni Google. Parecen restos del diseño anterior: **comprobar si algo las lee** |
| `ESTADO.md`, tarea 0d | «Decidir de quién es `politica-de-precio.ts`: sigue abierta» | La web y la API usan el contrato de `main`. Probablemente esté resuelta y no marcada |
| `ESTADO.md`, tarea 7 | «Pruebas de integración de la API: solo se probó a mano» | Hoy hay e2e de inbox, relay, barrido, BullMQ, cotizaciones, identity, visibilidad y catálogo |
| `docs/05-seguridad/02-proteccion-de-datos.md` (tarea 4d) | La redacción del consentimiento contradice al ADR-0008 | Faltan la pimienta y la clave de plataforma en el inventario §5 |

## 17. Pendientes del propietario

1. Arrancar a **Antigravity** con la 0c.29, la 0c.27 y la 0c.35.
2. **Postmark:** el dominio neutro, la cuenta con MFA y Retention Add-on, el DNS (DKIM, Return-Path y
   DMARC), el token en el gestor de secretos y la consulta al abogado por la SIC.
3. **Render y staging:** la cuenta con tarjeta, la rama de Neon solo con el esquema, los secretos por
   servicio, los Environments de GitHub, el DNS y el Paso 2 de Meta.
4. **Meta:** la verificación del negocio y la solicitud de Tech Provider, que son el camino crítico.
5. **Rotar** la contraseña de Neon y la clave de API de Stitch.
6. **Quitar** el `DATABASE_URL` global del shell.
7. Decidir el **nombre comercial, los precios y los planes**. El tarifario de Meta en COP sigue sin
   bajar.
8. **Protección de `main`**: GitHub Pro o asumir el riesgo.
9. Autorizar **Jira** (conector de Atlassian).
10. La **revisión legal** de la protección de datos.

## 18. Cómo comprobar este informe

```bash
git checkout main && git log --oneline -1          # debe ser 3a1369a o posterior
git tag --sort=-creatordate | head                  # v0.38.0 arriba
ls packages/database/prisma/migrations              # 22 carpetas
pnpm install && pnpm --filter @viajapro/database generate
pnpm typecheck && pnpm lint && pnpm build
gh workflow run ci.yml --ref main && gh run watch   # los 8 jobs, con aislamiento-tenants
```

Con una base **desechable**, nunca la compartida:

```sql
SELECT proname FROM pg_proc WHERE prosecdef;                 -- comparar con la matriz de la aserción 20
SELECT relname FROM pg_class WHERE relrowsecurity AND NOT relforcerowsecurity;  -- debe salir vacío
SELECT * FROM excepciones_rls;                              -- cada fila con su motivo
```

**Archivos clave**, por orden de lectura:

1. `CLAUDE.md` y `ESTADO.md`;
2. ADR 0003, 0008, 0010 y 0011;
3. `packages/database/prisma/migrations/`;
4. `aislamiento.spec.ts`;
5. `apps/api/src/modules/inbox/` (`procesar-change.ts`, `bandeja.prisma.ts` y
   `bandeja-en-vivo.gateway.ts`);
6. `apps/api/src/modules/identity/`;
7. `apps/api/src/shared/` (`guardia-de-rol.ts` y el middleware de tenant);
8. `.github/workflows/ci.yml`;
9. `docs/_integraciones/`.
