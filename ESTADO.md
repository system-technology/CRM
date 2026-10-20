# ESTADO — El hilo vivo de ViajaPro

> **Este es el primer archivo que lee cualquier persona o agente al abrir el proyecto.**
> Responde tres preguntas: dónde estamos, qué sigue, qué está bloqueado.
> Se actualiza al cerrar **cada** sesión de trabajo. Si está desactualizado, el hilo se rompió.

| Campo | Valor |
|---|---|
| Última actualización | 2026-10-20 (hasta el ADR-0012: proveedor de correo) |
| Actualizado por | Claude Opus 5.5 (`integrador`) |
| Fase | **Rebanada vertical de paquetes, en construcción** |
| Avance de la fase | Cotizador de punta a punta. **La cotización es la suma de sus tarifas y el precio «desde» es uno que el comprador puede pagar (v0.19.0).** Apretón de manos del webhook vivo. Bandeja web en construcción |
| Próximo hito | **El trabajador que convierte un `change` recibido en mensaje de bandeja.** La compuerta de pruebas vuelve a ser compuerta: aislamiento 39/39 en tres corridas seguidas el 2026-10-19 |

---

## 1. Dónde estamos

El repositorio tiene el **andamiaje completo**: estructura de monorepo con su configuración,
documentación de visión, producto, arquitectura, seguridad y roadmap, **ocho** ADR aceptados, la capa
de ingeniería asistida por IA (17 agentes en `main` y 3 más —producto, dueño y facilitador— retenidos
en la compuerta; 7 skills, 7 comandos, 6 hooks, MCP) y el gobierno de la integración a `main`.

**El cotizador funciona de punta a punta** —navegador, API, Neon— y está verificado abriéndolo en
un navegador real, no solo compilando. Lo que NO existe todavía: inbox de WhatsApp, persistencia de
cotizaciones, autenticación, y nada desplegado en un servidor. No hay cuenta de Meta Business
iniciada.

**Desde el 2026-10-08 se trabaja con dos IA en paralelo**, cada una en su propio worktree y su
propia rama: esta sesión en `feat/inbox-webhook` (`D:\Projects\CRM-api`) y Antigravity en
`feat/bandeja-web` (`D:\Projects\CRM-bandeja`). El traspaso es por archivo —`ENTREGA.md` y
`REVISION.md` en la rama— sin cartero humano. Ver `docs/09-ia/06-flujo-con-antigravity.md`.

**Del inbox existe ya, en ramas:** los contratos Zod de la bandeja (`packages/contracts/src/inbox.ts`,
en `main` desde v0.11.0), las tres piezas puras del webhook —firma HMAC sobre el cuerpo crudo,
apretón de manos y desglose del sobre— y el controlador del `GET`, con 62 pruebas y verificado
contra la API corriendo. La pantalla de conversación de la bandeja está construida y su primera
entrega de tiempo real **fue rechazada en revisión**.

Las dos pruebas que respaldan la afirmación anterior, con el catálogo sembrado:

| Caso | Resultado |
|---|---|
| 2 adultos + 2 niños en diciembre | Temporada alta, doble, 2 habitaciones, **$9.100.000 COP**, margen **20,0 %** |
| 3 adultos en doble | Avisa **"1 plaza sin usar, se paga igual"** |

Qué hay, concretamente:

| Área | Estado |
|---|---|
| Monorepo | **Instalado y compilando.** Node 22.20, pnpm 9.12 |
| Documentación | 33 documentos completos + 22 marcadores con responsable y fase |
| ADR | 0001 stack · 0002 WhatsApp · 0003 multi-tenancy · 0004 monolito modular · 0005 ramas · 0006 parametrización · 0007 Neon · **0008 resolución de tenant en webhooks (Aceptado)** |
| Agentes de IA | 17 en `main`, incluido `integrador`. Tres más —`jefe-de-producto`, `dueno-de-producto`, `facilitador`— esperando en la compuerta |
| Skills | Propias: `ciclo-funcionalidad`, `auditoria-integral`, `handoff-ia-externa`, `cerrar-sesion`, `nuevo-modulo`. De terceros, auditadas: `neon`, `neon-postgres` |
| Comandos | `/estado` `/auditoria` `/funcionalidad` `/handoff` `/adr` `/contexto` `/integrar` |
| Hooks | **De Claude Code:** inyección del hilo, guardián de secretos (19/19), guardián de rama (48/48), autorización de integración, revisión post-edición, recordatorio de cierre. **De git, desde v0.9.1:** `commit-msg` (commitlint) y `pre-commit` (lint-staged) — antes estaban configurados pero nunca se ejecutaban |
| MCP | **Stitch conectado y usado** (ámbito de usuario, 15 herramientas). `navegador` usado para verificar la interfaz. `memoria`, `docs-librerias`, `razonamiento` cargados. **`postgres` falla al conectar.** `github` y `sentry` sin autorizar |
| Fase 0 técnica | API viva, **30/30 aislamiento**, 32/32 dominio, 25/25 contratos. **No es "completa": su criterio de salida —aislamiento en verde en CI— no se ha cumplido nunca** (tarea 4a.1) |
| Compuertas de calidad | **Funcionando por primera vez desde v0.9.1.** `lint` 7/7 · `typecheck` 7/7 · `test` 6/6 · `build` 5/5 · `format:check` limpio. Antes cuatro de ellas eran imposibles de poner en verde |
| Backend | `apps/api` con catálogo y cotización. Probado con peticiones reales |
| Frontend | `apps/web`: Next.js 15 + Tailwind 4. **Cotizador verificado en navegador.** No hay autenticación: el tenant va por cabecera de desarrollo, solo con `APP_ENV=local` |
| Canal de WhatsApp | **Vivo.** App `1968557404100610`, número de prueba, mensaje recibido en un teléfono real el 2026-10-07. Ver `docs/10-onboarding/03-valores-del-entorno-de-pruebas.md` |
| Diseño | Sistema de diseño subido a Stitch (proyecto `8333038101997719867`). Tokens replicados en `apps/web/src/app/globals.css`. Capturas en `docs/_assets/diseno/` |
| Datos | Agencia demo sembrada: 3 paquetes, 5 temporadas, 26 precios |
| Contrato multi-harness | `AGENTS.md` en la raíz: cualquier IA trabaja bajo las mismas **trece** reglas. R12 faltaba hasta v0.9.1; R13 se añadió el 2026-10-07 |
| Repositorio | [github.com/Alfavear/CRM](https://github.com/Alfavear/CRM) · **privado** · `main` en **v0.18.0** (`fa73c4d`) |
| Gobierno de `main` | Compuerta local activa y probada. **Sin protección de servidor:** el plan gratuito no la permite en repos privados |

## 2. Decisiones ya tomadas (no reabrir sin ADR que las supersede)

| Decisión | Valor | Dónde quedó |
|---|---|---|
| Canal de WhatsApp | Meta Cloud API + Embedded Signup, como Tech Provider | ADR-0002 |
| Stack | TypeScript end-to-end: NestJS + Next.js + PostgreSQL + Prisma + Redis | ADR-0001 |
| Arquitectura | Monolito modular por contexto delimitado, tres procesos | ADR-0004 |
| Multi-tenancy | Esquema compartido + `tenant_id` + Row Level Security forzada | ADR-0003 |
| **Mercado base** | **Colombia.** Moneda COP, normativa colombiana, TRM, pasarelas locales | Decisión del propietario, 2026-10-06 |
| **Parametrización** | **Vertical configurable, no plataforma genérica.** Se parametriza la política de negocio, nunca los invariantes del dominio. Código abierto: no por ahora | ADR-0006 |
| **Modelo de ramas** | **`main` protegida. Solo el agente `integrador` escribe ahí**, tras siete compuertas. Trabajo en ramas de 1-3 días | ADR-0005 |
| **Cabeza de playa** | **La agencia que revende paquetes turísticos.** Rebanada vertical completa y estrecha, no fases horizontales | `docs/01-producto/07-cabeza-de-playa-paquetes.md` |
| **Entorno de desarrollo** | **Número de prueba de Meta.** La verificación del negocio NO bloquea construir, solo lanzar | ADR-0002 |
| **Alta de la agencia cliente** | **No requiere verificación de Meta ni página web.** Sin verificar: conversaciones entrantes ilimitadas, 250 iniciadas/24h, 250 plantillas. Verificado 2026-10-07 | `docs/10-onboarding/01-requisitos-para-la-agencia.md` |
| Alcance v1 | Los cuatro bloques siguen siendo el mapa del alcance total | `docs/01-producto/01-alcance-mvp.md` |
| Diseño | Stitch para explorar; shadcn/ui en `packages/ui` para producir | `docs/01-producto/06-diseno-y-ux.md` |
| **Visibilidad de conversaciones** | Sin `conversaciones.ver_todas`: las asignadas a uno + la cola común. Responder la primera vez asigna. Al reasignar, el anterior deja de verla. «Todos ven todo» = dar `ver_todas` al rol asesor. Criterios CA1-CA17 | `docs/01-producto/12-visibilidad-de-conversaciones.md` |
| Norte de producto | El brochure fija la dirección: qué módulos, qué flujo, qué tono | `docs/00-vision/05-norte-del-producto.md` |

### Lo comercial NO está decidido

`docs/_assets/brochure-de-inspiracion.jpeg` es **inspiración y dirección de producto, no un compromiso comercial.**
Lo que aporta —módulos, flujo, tono, horizonte— está recogido en
`docs/00-vision/05-norte-del-producto.md`. Lo que **no** está decidido:

| Punto | Estado real |
|---|---|
| **Nombre comercial** | **Sin decidir.** `ViajaPro` es solo nombre en clave técnico (`@viajapro/*`, `viajapro_app`). Cambiarlo hoy es un comando; con clientes, una migración |
| **Precios y planes** | **Sin decidir.** Las cifras del brochure son una exploración. Ver los cuatro modelos posibles en `docs/00-vision/04-modelo-de-negocio.md` |
| **Nombres de módulos en la interfaz** | **Propuesta, no decisión.** Los del brochure son un punto de partida razonable |

## 3. Qué sigue — cola de trabajo

Ordenada. La primera es la que debe tomarse ahora.

| # | Tarea | Agente / dueño | Estado |
|---|---|---|---|
| **0** | Reparar la suite de aislamiento, que se envenenaba a sí misma | `qa` | **Cerrada el 2026-10-19 (v0.19.0).** El integrador corrió la suite tres veces seguidas contra Neon sin limpiar a mano: 39/39 las tres, sin residuo entre corridas (`4f08d25`, `7ba3b8c`) |
| 0b | Permiso para `limpiar-fixtures.mjs --borrar` | Usuario | **Resuelta por diseño (v0.19.0):** `pnpm test` del paquete limpia solo, y solo residuo de más de 15 min con el prefijo `fixture-aislamiento-` |
| 0c | Una base por árbol de trabajo, o fixtures con identificador por proceso | `devops` | **Resuelta la segunda opción (`7ba3b8c`, v0.19.0).** La base sigue siendo compartida: ver la cola del 2026-10-19 sobre esquema ajeno |
| 0d | **Decidir de quién es `politica-de-precio.ts`.** Antigravity lo tiene a medio escribir en `feat/bandeja-web` y la otra sesión lo integró hoy en `main` | `arquitecto` | **Sigue abierta.** v0.19.0 no la resuelve: `feat/bandeja-web` sigue sin integrar |
| 1 | **Iniciar verificación de Meta Business y solicitud de Tech Provider** | Usuario | **Camino crítico, sin empezar** |
| 2 | **Recibir el tarifario real del mayorista** de la agencia piloto | Usuario | La agencia ya está tramitando la información (2026-10-07). Hasta que llegue, el catálogo sigue modelado con datos verosímiles |
| 2b | **Bajar el tarifario de Meta para Colombia en COP** del CSV oficial | Usuario | Cinco minutos con un navegador. Sin esa cifra el plan de entrada se fija a ciegas |
| 3 | Reparar la conexión del MCP `postgres` o retirarlo de `.mcp.json` | `devops` | Falla con `CONNECTION_CLOSED` |
| 4a | Inbox — esquema, roles, funciones y aserciones | `datos` | **Cerrada e integrada (v0.20.0, 2026-10-19).** 50/50 de aislamiento en tres corridas seguidas contra Neon, cero saltadas; las cuatro tablas con `tenant_id`, RLS forzado y política `USING` + `WITH CHECK`, comprobado en el catálogo |
| 4a.1 | Ver en verde los jobs `aislamiento-tenants` y `test` en CI | `devops` | **Cerrada (2026-10-19).** Ocho jobs en success: https://github.com/Alfavear/CRM/actions/runs/39308173658 |
| 4b | Inbox — API: tres orígenes de conexión, guardia de identidad, puerto a `crm`, relay por `change` | `backend` | **Hecha (v0.21.0, 2026-10-19).** POST durable verificado vivo; relay por `change` con `jobId` por change; trabajador `ProcesarChange` con el rol `viajapro_webhook`, que escribe el mensaje bajo RLS (e2e contra Neon 5/5). **Sin verificar contra Redis real**: ver 4c y la cola del 2026-10-19 |
| 4c | Las 3 verificaciones que **no** son de base de datos: arranque del proceso, alta de extremo a extremo, ensayo de rotación de la pimienta | `backend`, `qa`, `devops` | **En curso.** La de arranque está hecha: `guardia-de-rol.ts` comprueba identidad, `rolsuper` y `rolbypassrls`, y la API registra al arrancar «Conectado como 'viajapro_app', verificado». Faltan las otras dos |
| 4d | Alinear `05-seguridad/02-proteccion-de-datos.md` con el ADR-0008 | `documentador` | La redacción de consentimiento lo contradice. Faltan pimienta y clave de plataforma en el inventario §5 |
| 4e | ADR que enmiende el ADR-0008 | `arquitecto` | **Cerrada por el ADR-0010** (`docs/03-adr/0010-webhook-tal-como-es-y-el-trabajador-en-apps-api.md`, integrado el 2026-10-19). **Aceptado en modo desatendido: falta que el propietario lo ratifique** |
| 4f | Reconciliación directorio ↔ verdad | `datos` | **Cerrada (v0.21.1, 2026-10-19).** Disparador `canales_propagar_estado`: lleva SUSPENDIDO/REVOCADO al directorio y nunca relaja. Aserción 46 vista en rojo sin el arreglo; aislamiento 51/51 |
| 4g | `purgar_directorio`, o decidir que es manual | `arquitecto`, `datos` | Hoy ninguna fila del directorio se puede borrar por ningún camino de código. **No bloquea un esquema vacío; bloquea el primer tenant en producción** |
| 4h | Trabajo anual de creación de particiones del historial | `devops` | Si falta la del año siguiente, **ninguna agencia puede conectar su canal**. Mejor: un *event trigger* que lo haga imposible de olvidar |
| 4i | Aserción de concurrencia determinista y orden de las aserciones | `qa` | La de la carrera falla hacia el verde; y 22/23 reparan privilegios, así que enmascaran a cualquier aserción declarada después |
| 5 | Bandeja de conversaciones en la web | Antigravity | **Integrada entera en cuatro tandas (v0.24.0, v0.26.0, v0.27.0 y v0.28.0).** `apps/web` en `main` es idéntico a `feat/bandeja-web` @ `6d790ff`. Lo siguiente, rama por rama |
| 6 | Guardar cotizaciones con versiones inmutables | `backend` | **Hecha (esquema v0.22.0, API v0.23.0, 2026-10-19).** `POST /api/v1/cotizaciones`, `POST /:id/versiones` y `GET /:id`. El servidor recalcula los importes y no guarda los que manda el cliente. Siguen en cola el listado, el envío y los estados |
| 7 | Pruebas de integración de la API | `qa` | Solo se probó a mano. **La verificación del cotizador fue manual: no hay prueba automática que la repita** |
| 8 | CI en GitHub Actions corriendo de verdad | `devops` | **Cerrada (2026-10-19).** Primer verde: https://github.com/Alfavear/CRM/actions/runs/39308173658. Las 18 migraciones se reconstruyen desde cero en un Postgres 16 limpio |
| 9 | Decidir nombre comercial, modelo de cobro y precios | Usuario | Antes de vender |
| 10 | Resolver la protección de `main` en GitHub | Usuario | Plan gratuito no la permite en repos privados |
| 11 | **Rotar la contraseña de Neon y la clave de API de Stitch** | Usuario | **Sigue pendiente.** `ac7fb99` rotó los tres roles de PostgreSQL, que es otra cosa. Ambas se pegaron en el chat; un secreto expuesto no se borra, se rota |
| 11b | `META_APP_SECRET` y `WEBHOOK_PAYLOAD_KEY_VERSION` en `.env` | Usuario | **Cerrada (2026-10-19).** El integrador comprobó la presencia sin imprimir valores. `META_APP_SECRET`, `WHATSAPP_DIRECTORY_PEPPER` y `WEBHOOK_PAYLOAD_KEY` tienen valor en los cuatro árboles, y en cada variable es el mismo en los cuatro (mismo hash). `WEBHOOK_PAYLOAD_KEY_VERSION=1` en los cuatro |
| 11c | Los metadatos de decorador no siempre llegan con el transpilador de desarrollo | `backend` | **Hecha (`85eceac`, v0.19.0).** `@Inject` explícito y `guardia-de-inyeccion.spec.ts`, que pone en rojo cualquier dependencia sin token |
| 11d | El aviso «Acceso sin contexto de tenant» se emitía una vez por mensaje | `backend` | **Hecha (`f57925b`, v0.19.0).** El webhook usa `sinTenantDeclarado`, con la operación declarada en `operaciones-de-plataforma.ts` (tipo cerrado). La variante ruidosa sigue para todo lo no declarado |
| 12 | Autenticación: el `tenant_id` debe salir del token de sesión | `datos`, `backend`, Antigravity | **ADR-0011 aceptado y ratificado. Rebanadas 1 (v0.33.0), 2 (v0.34.0) y 4 (v0.35.0) integradas.** Queda la **3**: la pantalla de ingreso y el selector de agencia (Antigravity) |
| 13 | La carrera de `turbo` entre `build` y `typecheck` | `devops` | **Hecha (`f9da930`, v0.19.0).** `typecheck` de `web` y `database` depende de su `build`. Verificado: `typecheck --force` 9/9 sin caché |
| 14 | El aviso de `any` no es una compuerta | `devops` | `no-explicit-any` está en `warn` y ningún script lleva `--max-warnings 0`: hoy hay cero `any`, pero el primero entraría sin que lint falle |

## 4. Bloqueos y riesgos activos

| Bloqueo | Impacto | Dueño | Mitigación |
|---|---|---|---|
| ~~La suite de aislamiento contra Neon compartido no sirve de compuerta mientras dure la deriva (la aserción 11, roja por una migración sin integrar)~~ | — | `datos` | **Cerrado en v0.33.0 (2026-10-20):** `20261019230000_identidad` ya está en `main`, con la misma `checksum` que en Neon. `migrate status` desde `main`: 22 migraciones, «up to date», sin nada pendiente ni divergente. **El CI sigue siendo la compuerta de aislamiento** |
| ~~Rotar `WHATSAPP_WEBHOOK_VERIFY_TOKEN`~~ | — | Usuario | **Cerrado el 2026-10-19.** Rotado en los cuatro `.env`; el integrador comprobó que el valor viejo ya no aparece en ninguno. Meta nunca lo tuvo, porque el webhook no está configurado |
| **Modo desatendido detenido en la compuerta** — el commit `59a52d8` amplía los permisos de los propios agentes | Cada commit y cada push siguen pidiendo autorización al propietario, con dos IA trabajando en paralelo | Usuario | **Solo el propietario puede aprobarlo, en su propia sesión**: el integrador no acepta de segunda mano un cambio a la configuración que define lo que los agentes pueden hacer sin preguntar. Y antes hay que sacar `git clean -xdf` de la lista de permitidos: borra lo no rastreado **y** lo ignorado, incluidos los tres `.env` |
| **`Bash(cat:*)` permitido hace decorativo el `deny` de `Read(./.env)`** | `cat .env` funciona hoy. O ese `deny` significa algo, o sobra por honestidad | Usuario | Decidirlo al tocar los permisos |
| Verificación de Meta Business sin iniciar | **Bloquea lanzar con clientes reales, NO bloquea construir.** Tarda semanas | Usuario | Arrancar el trámite en paralelo. Mientras tanto se desarrolla con el número de prueba de Meta |
| **Tarifario real sin llegar** | El modelo de precios se sigue validando contra datos que inventamos nosotros. Hay piloto desde el 2026-10-07, falta su catálogo | Usuario | Pedirlo aunque sea parcial: un solo paquete real vale más que tres verosímiles |
| **Meta cobra los mensajes de servicio desde el 2026-10-01** | El costo variable por agencia cambia de orden de magnitud justo donde está nuestro tráfico. **Puede invalidar el plan de entrada** | Usuario | Bajar el tarifario de Colombia en COP del CSV oficial. Cinco minutos con un navegador; la herramienta del agente no pudo abrirlo |
| Alcance de v1 vs. expectativa de calendario | Riesgo de cinco cosas a medias | Usuario | Roadmap por fases ya escrito; decidir dónde cortar |
| MCP sin validar | Los agentes no tienen las herramientas que el método asume | Usuario | Requiere sesión interactiva — no se puede hacer automatizado |
| **`main` sin protección de servidor** — el plan gratuito de GitHub no permite proteger ramas en repos privados | La regla R11 depende hoy solo de disciplina y de hooks locales. Tolerable con una persona; **no lo es con dos** | Usuario | GitHub Pro (recomendado), o repo público, o riesgo asumido. Ver `.github/PROTECCION-DE-RAMA.md` |
| Nada comercial está definido: nombre, precios, planes | No se puede vender ni proyectar ingresos | Usuario | Hay piloto, así que ya es posible. Pero no antes de tener la tarifa de Meta en COP: sin ella el precio de entrada se fija a ciegas |
| Nombre en clave `ViajaPro` extendido por todo el repositorio | Si se decide otro nombre hay que renombrar | Usuario | Barato mientras no haya código. Un comando `sed`. Caro con clientes |
| Revisión legal de protección de datos pendiente | No se puede salir a producción sin ella | Usuario | Abogado del país de operación, antes de Fase 4 |

## 5. Preguntas abiertas

1. **¿Cuándo llega el tarifario real del piloto?** Es lo que de verdad cambia el catálogo. La
   agencia ya está tramitando la información.
2. **¿Nombre comercial?** Hoy `ViajaPro` es solo un identificador técnico.
3. **¿Modelo de cobro?** Por asesor, por conversación, por tramos, o base + consumo. Cada uno cambia
   qué hay que medir en el producto desde el primer día. **Ahora pesa más:** desde el 2026-10-01 los
   mensajes de servicio se cobran, así que el costo variable ya no es ruido.
4. ¿Qué pasarela usan hoy las agencias colombianas: Wompi, PayU, ePayco o Mercado Pago? Bloquea la Fase 4.
5. ¿Facturación electrónica DIAN desde v1, o se delega al ERP de la agencia?
6. ¿Agencias minoristas, operadores receptivos, o ambos? El brochure sugiere minoristas; confirmarlo
   cambia el peso del cotizador frente al de la operación.
7. ¿Presupuesto mensual tope para la capa de IA? Define si la Fase 5 usa el modelo rápido o el fuerte.
8. ¿Cuántas personas tendrá el equipo? El roadmap asume 3-4. Con 2 se duplica el calendario.

## 6. Bitácora

- [`2026-10-13-la-compuerta-que-se-envenena-sola.md`](docs/_bitacora/2026-10-13-la-compuerta-que-se-envenena-sola.md) ← **empieza por aquí**
- [`2026-10-13-el-veinte-por-ciento-tiene-dos-lecturas.md`](docs/_bitacora/2026-10-13-el-veinte-por-ciento-tiene-dos-lecturas.md)
- [`_integraciones/2026-10-13-v0.18.0.md`](docs/_integraciones/2026-10-13-v0.18.0.md) — por qué se integró con la compuerta de pruebas en rojo
- [`2026-10-10-el-dia-que-medimos-todo.md`](docs/_bitacora/2026-10-10-el-dia-que-medimos-todo.md)
- [`2026-10-07-el-dia-que-nos-pusimos-un-freno.md`](docs/_bitacora/2026-10-07-el-dia-que-nos-pusimos-un-freno.md)
- [`2026-10-07-el-adr-que-se-defendio-tres-veces.md`](docs/_bitacora/2026-10-07-el-adr-que-se-defendio-tres-veces.md)
- [`2026-10-07-primera-interfaz.md`](docs/_bitacora/2026-10-07-primera-interfaz.md)
- [`_integraciones/2026-10-07-v0.9.1.md`](docs/_integraciones/2026-10-07-v0.9.1.md) — por qué cuatro compuertas nunca pudieron correr
- [`2026-10-07-backend-vivo.md`](docs/_bitacora/2026-10-07-backend-vivo.md)
- [`2026-10-07-falso-positivo-del-guardian.md`](docs/_bitacora/2026-10-07-falso-positivo-del-guardian.md)
- [`2026-10-07-gobierno-de-la-integracion.md`](docs/_bitacora/2026-10-07-gobierno-de-la-integracion.md)
- [`2026-10-06-fundacion-del-proyecto.md`](docs/_bitacora/2026-10-06-fundacion-del-proyecto.md)

---

## Cómo actualizar este archivo

Al cerrar una sesión de trabajo (`/estado` lo hace de forma guiada):

1. Actualizar la tabla de cabecera: fecha, quién, fase, avance.
2. Mover a **"Dónde estamos"** lo que se completó. Redactarlo como estado, no como narración.
3. Reescribir **"Qué sigue"** con la cola real. Algo que lleva tres sesiones sin moverse o no es
   prioritario o está bloqueado: decidirlo y marcarlo.
4. Añadir o retirar bloqueos. Todo bloqueo lleva dueño. Un bloqueo sin dueño después de dos
   sesiones es un problema, no un riesgo.
5. Crear la entrada de bitácora correspondiente.

---

## Cola abierta por la integración del 2026-10-10

| Qué | Dueño | Por qué no bloqueó |
|---|---|---|
| **Resuelto el mismo 2026-10-10.** La suite de aislamiento vuelve a **30/30 en verde**, firmada por el integrador sobre `main` en `01dd143`. Eran 174 filas de fixtures de tres tenants, todas `duplicate key`, ninguna de aislamiento. El limpiador quedó en `chore/limpiar-fixtures` (`79fe4b7`) | `datos` | — |
| ~~La aserción 17 comprobaba el NOMBRE de la columna, no lo que guarda~~ | `qa` | **Cerrada en v0.31.0:** la 17 decide por columna; su contraprueba va dentro de `BEGIN…ROLLBACK` |
| `aislamiento.spec.ts` limpia sus fixtures solo en `afterAll`. Una ejecución interrumpida envenena todas las siguientes, que es justo lo que pasó hoy. La limpieza tiene que correr también en `beforeAll` | `qa` | Es higiene del suite, no una fuga |
| `decodificarClave` acepta hexadecimal o base64. La regla es determinista (64 caracteres `[0-9a-f]` → hex; lo demás, base64) y el largo se verifica después, así que se aceptó. Pendiente: que el generador de secretos y el lector acuerden **una** codificación y la rama desaparezca | `devops` | No hay sustitución silenciosa: lo que no mide 32 bytes lanza al arrancar |
| Auditar la cadena de inyección de `quoting` y `shared`: el mismo silencio de Nest que construyó el controlador del inbox con cero dependencias es posible ahí | `backend` | Hoy no está roto; el inbox ya lleva `@Inject` explícito |
| `dueno-de-producto` tiene `Bash` entre sus herramientas y `facilitador` no declara lista, así que las hereda todas. El hook `guard-rama` les impide escribir en `main` | `arquitecto` | Defensa en profundidad ya presente |

## Cola abierta por la integración del 2026-10-11 (v0.14.0)

| Qué | Dueño | Por qué no bloqueó |
|---|---|---|
| **`WITH CHECK` no es lo que ADR-0003 y `policies/001` dicen que es.** Quitarlo dejando solo `USING` no mató ninguna mutación: PostgreSQL reutiliza la expresión de `USING` para la escritura cuando `WITH CHECK` se omite. La frase «sin él un tenant puede escribir filas de otro» es **técnicamente falsa tal como está escrita**. El ADR es inmutable: corresponde una nota de superseding o un ADR nuevo que lo precise | `arquitecto` | **Hoy no hay fuga.** Las políticas sí llevan `WITH CHECK` explícito, que es lo correcto y es obligatorio en cuanto `USING` y `WITH CHECK` difieran. Lo falso es la justificación, no el aislamiento |
| La batería de mutaciones tiene un punto ciego: borrar `WITH CHECK` de una política no pone ninguna prueba en rojo. Hace falta una mutación que haga divergir `USING` de `WITH CHECK` para que la cobertura signifique algo | `qa` | Es cobertura de la prueba, no una brecha del sistema |
| `pnpm typecheck` depende del cliente Prisma generado y el pipeline de Turbo no declara `generate` como dependencia. En un árbol recién clonado el typecheck falla con errores que no son del código (`'probabilidad' does not exist in type 'OportunidadCreateManyInput'`) | `devops` | Se resuelve con `pnpm --filter @viajapro/database generate`; no afecta al artefacto desplegado |
| Ninguna de las cuatro ramas trajo entrada en `docs/_bitacora/` para su sesión. El registro de la integración está en `docs/_integraciones/2026-10-11-v0.14.0.md` | `documentador` | El hilo queda trazable por el registro de integración |
| `docs/01-producto/10-catalogo-real-de-referencia.json` viaja con un PNG de 4,6 MB en el historial. Es evidencia primaria del tarifario y se aceptó por eso; si se repite con cada tarifario, el repositorio se hincha | `devops` | Una vez no es un patrón |

## Integración del 2026-10-11 (tarde) — v0.15.0

`feat/crm-esquema` **integrada** (`bb58ed2`, `v0.15.0`): migración aplicada a Neon y las
**39/39** aserciones de aislamiento reproducidas por el integrador contra la base real.
`main` está publicado y verificado contra el remoto.

`feat/crm-api` **devuelta** por una sola cosa: ninguna prueba monta el `CrmModule`
ensamblado —todo son dobles— y este proyecto ya perdió un día por un controlador que Nest
construyó con cero dependencias sin que ninguna prueba con dobles lo viera. Entra en cuanto
haya salida de peticiones reales contra la API corriendo o una prueba que monte el módulo.

| Cola nueva | Dueño | Por qué no bloqueó |
|---|---|---|
| No existe ninguna prueba que arranque el `AppModule` real. El riesgo no es del CRM: es de cualquier módulo futuro. Hace falta un `*.e2e-spec.ts` que monte la aplicación aunque sea con la base de pruebas | `qa` | Para `feat/crm-api` **sí bloquea**; como deuda transversal del resto de módulos, va a la cola |
| La regla «perdida exige motivo» se mudó del esquema al caso de uso al pasar la etapa a id. Está aislada en función pura y verificada por mutación, pero ahora la base **ya no la impone**: una escritura que no pase por el caso de uso puede dejar una oportunidad perdida sin motivo | `datos` | Hoy no hay otra ruta de escritura; cuando la haya, toca `CHECK` o disparador |

## Integración del 2026-10-11 (cierre) — v0.16.0

`feat/crm-api` **integrada** (`6c843b0`, `v0.16.0`): el módulo `crm` de la API con la primera
prueba que arranca el `AppModule` ensamblado contra Neon. api `112 passed`, aislamiento
**39/39**. Las cinco ramas del día quedaron integradas.

| Cola nueva | Dueño | Por qué no bloqueó |
|---|---|---|
| **La prueba del `AppModule` certifica el montaje bajo el runtime de vitest, no bajo el del servidor.** Quitar el `@Inject` explícito del controlador del webhook —el defecto del 2026-10-11 por la mañana— no la pone en rojo: vitest transpila con metadatos de decorador y `tsx` no. Falta ejecutar la aplicación como se ejecuta de verdad: `pnpm build` y arrancar el `dist` | `devops` | El límite está declarado en la cabecera del propio archivo de prueba, así que nadie puede leer la red como más ancha de lo que es. El `@Inject` explícito sigue siendo obligatorio **por convención, no por compuerta** |
| `apps/api` corre con `vitest run --passWithNoTests`. Si el `include` se rompiera otra vez, la suite pasaría con cero pruebas en vez de avisar. Conviene un umbral mínimo de pruebas o quitar la bandera | `qa` | Hoy el `include` es explícito y la cuenta es visible (112) |

---

## Integración del 2026-10-11 (noche) — v0.16.1 · v0.17.0 · v0.17.1

**Cuatro de cinco ramas integradas. `feat/inbox-esquema` devuelta por `pnpm lint` en rojo.**

| Rama | Veredicto | Versión |
|---|---|---|
| `fix/compuerta-de-pruebas` | **Integrada** (`03d4ee5`) | v0.16.1 |
| `fix/semilla-etapas` | **Integrada** (`a340360`) | v0.16.1 |
| `feat/ventana-servicio` | **Integrada** (`202cfbf`) | v0.17.0 |
| `feat/semilla-crm` | **Integrada** (`a468287`) | v0.17.1 |
| `feat/inbox-esquema` | **DEVUELTA** | — |

Compuertas de las cuatro integradas, corridas por el integrador: `typecheck` 7/7 · `lint` 7/7 ·
`test` 6/6 (api **133 passed**, aislamiento **39/39** contra Neon, domain 32, contracts 56) ·
`build` 5/5 · `format:check` limpio. `pnpm db:seed` corrido **dos veces seguidas** contra Neon sin
P2002 y `pnpm db:seed:crm` con `creadas ahora 0` en la segunda.

### Por qué volvió `feat/inbox-esquema`

Una sola cosa, y es de hoy: **`pnpm lint` sale en rojo** por el arnés de mutaciones que trae la
propia rama, `packages/database/scripts/mutaciones-aislamiento.mjs`:

```
36:33  error  Unexpected control character(s) in regular expression:    no-control-regex
136:7  error  The value assigned to 'r' is not used in subsequent statements  no-useless-assignment
```

El resto de la rama se verificó y **está en verde**: `typecheck` 7/7, `build` 5/5,
`format:check` limpio y **50/50 de aislamiento contra Neon** —la cifra que la rama afirmaba,
comprobada por el integrador, no aceptada de palabra—. La siembra del inbox, que su autor no
había podido correr, **corre**: con `fix/semilla-etapas` ya en `main`, `pnpm db:seed` deja
1 conversación, 3 mensajes y 2 plantillas. El conflicto en `packages/database/package.json` se
resuelve conservando los dos scripts (`seed:crm` y `mutaciones`); `prisma/seed.ts` fusiona solo.

**Es una vuelta, no tres (R13):** corregidos esos dos errores, la rama entra. No se abre frente
nuevo sobre ella.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| **`mensajes.texto` sin cifrar, con índice de búsqueda trigram.** Ahí van a ir números de pasaporte (R10). El argumento del autor es correcto —cifrado no hay búsqueda, y la bandeja busca— y los controles que aplica son reales: RLS forzada, prohibición de copiarlo a `registros_auditoria` ni al `outbox`, declarada en un `COMMENT` de la columna | `auditor-seguridad` + `arquitecto` | Hoy no hay un solo mensaje real guardado: el riesgo es futuro, y la columna de «el día que…». **Pero el plazo es duro: el ADR tiene que estar cerrado antes de que el trabajador persista el primer mensaje de producción**, porque cifrar después es migrar filas existentes, no cambiar una línea |
| `mensajes.cotizacion_id` existe **sin** clave foránea porque `cotizaciones` todavía no existe. El plan está escrito en la migración: `ADD CONSTRAINT ... NOT VALID` + `VALIDATE` | `datos` | La columna hoy no apunta a nada. **La tarea es de quien cree la tabla `cotizaciones`**, en esa misma migración, y no en otra |
| **Deriva entre `schema.prisma` y la base**: la unique parcial `(tenant_id, clave) WHERE clave IS NOT NULL` de `etapas_pipeline` existe en la base y Prisma no la modela. Hoy no duele porque la semilla ya no se apoya en el orden | `datos` | Es deriva de modelado, no de comportamiento. Pero conviene un barrido: lo que la base exige y el esquema no dice es un error que aparece en producción |
| **Decisión de NO particionar `mensajes`** y su razón —particionar por fecha obligaría a meter la clave de partición en la unique de `wamid` y el mismo reintento de Meta entraría dos veces, rompiendo R5— vive hoy en un comentario de migración. Merece ADR | `arquitecto` | La decisión está tomada y argumentada; lo que falta es dónde vive. Cuando la rama entre |
| Las cuatro ramas integradas esta noche **no traían entrada de bitácora**: la escribió el integrador al cerrar | `facilitador` | El hilo quedó cerrado igual, pero la bitácora es del que trabaja, no del que integra |

---

## 2026-10-13 — ADR-0009, revisión 2: paramétrico, y el margen deja de ser un número de cabeza

El propietario instruyó dos cosas: **«que sea paramétrico, estas agencias de turismo no todas
trabajan igual»** y **«tarifario neto del mayorista, margen el 20 %»**. La primera retiró la última
premisa que quedaba en pie en el ADR: que había **un** arquetipo de agencia al que apostar.

**Qué cambió en la decisión.** El encuadre anterior trataba «salida programada» y «fecha abierta»
como dos modelos rivales —de ahí la opción B, y de ahí que la opción C (los dos conviviendo) se
descartara por duplicar el cotizador—. No son dos modelos: son dos valores de un eje. **Una tarifa
es un precio válido para una ventana de fechas de salida; una salida programada es la ventana de un
solo día.** Con eso `Temporada` no se retira, se generaliza a `Vigencia`, y hay **una sola función
de resolución** para las dos formas de vender. El ADR cambió de título en consecuencia.

**Los tres ejes paramétricos, todos nivel 1 de ADR-0006:** cómo se publica la vigencia
(`modoDeCatalogo`, que afecta a las altas y **nunca al cálculo**); cómo se forma la venta (§2); y
qué pregunta el cotizador — que **no es un interruptor**: se deriva del tarifario, porque una
bandera que puede contradecir al dato es un defecto esperando su turno. El ADR lleva además la
lista explícita de lo que **nunca** se parametriza (R12).

**La ambigüedad que vale dinero y que no se adivinó.** «Margen del 20 %» tiene dos lecturas:

| Lectura | Cómo lo dice una agencia | Sobre un neto de $1.000.000 |
|---|---|---|
| `SOBRE_EL_NETO` | «le subo el 20 %» | venta **$1.200.000** |
| `SOBRE_LA_VENTA` | «me deja el 20 %» | venta **$1.250.000** |

Son **$50.000 por silla**; en un bus de cuarenta, dos millones por salida. El código toma
`SOBRE_EL_NETO` por defecto **y lo declara como suposición nuestra, no como dato del propietario.**

**Qué se construyó, y por qué es seguro construirlo con el ADR sin firmar.** Solo el eje 2.
ADR-0006 ya puso el *markup* en el nivel 1 por tenant en v1, así que la política de precio no
depende de la firma del ADR-0009: la agencia necesita declarar su margen cuelgue la tarifa de donde
cuelgue. Los ejes 1 y 3 **no se tocaron**.

- `packages/domain/src/precio-de-venta.ts` — `calcularVenta`, `derivarNeto`, `calcularMargen`,
  `redondearA`, y `POLITICA_POR_DEFECTO`. Aritmética pura, sin reloj ni base de datos.
- `packages/contracts/src/politica-de-precio.ts` — el espejo Zod, **sin repetir el «20»**: el valor
  por defecto vive en un solo sitio, para que no haya dos fuentes del mismo número separándose.
- 20 pruebas nuevas, 52 en el paquete `domain`, **280 en el monorepo**.

**Lo que esto desbloquea para la demostración.** Seguimos sin la hoja de netos del mayorista: lo
que tenemos son precios de venta al público. Con `derivarNeto` la semilla puede llevar un neto
coherente con el margen declarado —`venta ÷ 1,20`— **marcado como derivado**. No es el dato del
mayorista y no debe enseñarse como tal.

**Las cinco compuertas, ejecutadas:** `lint`, `typecheck`, `test` (280), `build`, `format:check`.
Todas en verde. El `typecheck` de la web dio primero un rojo **falso** por un `.next/types` viejo
que apuntaba a una pantalla de la rama de Antigravity; es la tarea 13 de la cola, ya documentada,
no un defecto nuevo.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| **¿El 20 % es sobre el neto o sobre la venta?** Es una palabra del propietario y un campo de una tabla; no se toca una línea de código | Usuario | El valor por defecto ya está puesto y probado. Pero **mientras no se confirme, toda cifra de margen que enseñemos lleva ese asterisco** |
| ~~La `PoliticaDePrecio` **no tiene todavía tabla ni RLS**~~ — **resuelto en el mismo commit que entró el 2026-10-13**: `politicas_de_precio` existe, con `tenant_id`, RLS por `aplicar_aislamiento_tenant()` y tres `CHECK`. Lo que falta es la pantalla de configuración | `frontend` | Corregido por el integrador al cerrar: la línea describía el estado de un commit anterior de la misma rama |
| **R8 dice «centavos» en `CLAUDE.md`** y lo correcto es «unidad mínima de la moneda»: en COP esa unidad es **el peso** | `documentador` | El código ya lo hace bien y hay prueba que lo fija. Es la redacción la que miente, y ya causó un error de dos órdenes de magnitud que llegó hasta la pantalla |
| La **resolución de tarifa con desempate** —lo más específico gana; empate en longitud es error de datos— es código que no existe y es donde se esconderán los defectos de precio | `backend`, `qa` | Espera la firma del ADR-0009. Cuando llegue: **pruebas de solape, no de camino feliz** |
| Precio por **fecha de compra** (*early bird*): la ventana por fecha de salida no lo cubre | `arquitecto` | Nadie lo ha pedido todavía. Si llega, **pide ADR propio**, no un campo más en la condición de la tarifa |

---

## 2026-10-13 (tarde) — ADR-0009 firmado y el catálogo real sembrado

El propietario fijó la regla y pidió avanzar sin acumular salvedades. **ADR-0009 pasa a Aceptado**
con la decisión de precio cerrada: **neto del mayorista + 20 % sobre el neto**.

### Lo que existe ahora, medido contra Neon

| Pieza | Estado |
|---|---|
| `vigencias` (antes `salidas`), `tarifas`, `politicas_de_precio` | Migradas y con RLS aplicada |
| Prueba de aislamiento | **39/39**, incluida la 23, que reconstruye la cadena de migraciones desde cero |
| Catálogo real de Agencias André's Tours | **33 paquetes, 78 vigencias, 79 tarifas** |
| `resolverVigencia` con desempate | 20 pruebas, incluidas las de solape |
| Política de precio | Sembrada: 20 %, `SOBRE_EL_NETO`, redondeo 1.000, modo `AMBOS` |

### La hoja real confirmó la decisión del ADR

No hizo falta esperar a otra agencia: **la misma hoja vende de las dos maneras.** Siete grupos
publican fechas concretas —sábado 3 y 10, domingo 4 y 11— y las cuatro super excursiones llevan
cada una **su propia** fecha de salida y de regreso. Con un solo arquetipo, media hoja no cabría.

Y la promo de pareja quedó donde tenía que quedar: **una vigencia con dos tarifas**, medida contra
la base —

```
Parque Consotá  2026-10-11  publicada=true
   Adulto         POR_PERSONA cubre=1  venta=189000  neto=157500  margen=31500 (20,00 %)
   Promo pareja   POR_GRUPO   cubre=2  venta=280000  neto=233333  margen=46667 (20,00 %)
```

— que es exactamente para lo que existe `UnidadDeCobro`. Son 79 tarifas sobre 78 vigencias: la de
más es esa.

### Decisiones que quedan escritas aquí porque no están en el ADR

- **`salidas` se renombró, no se recreó.** Conserva filas, política RLS y foránea. Recrearla habría
  dejado la tabla sin política hasta la línea que la vuelve a aplicar.
- **Las dos invariantes del contrato se repiten como `CHECK` en la base.** Zod protege lo que entra
  por la API; una semilla con un error de dedo no pasa por Zod.
- **Los netos de la semilla son derivados** —`venta ÷ 1,20`— y queda dicho en las notas del
  mayorista, que se llama «Mayorista por confirmar» a propósito.
- **La hoja no declara régimen alimenticio**, así que los paquetes nacen `SIN_ALIMENTACION`: es
  preferible a suponer un «todo incluido» que haya que desdecir delante de un cliente.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~Meterle el `tenant_id` dentro a las claves foráneas~~ | `datos` | **Cerrada en v0.31.0:** las tres simples que quedaban (`paquetes`→`mayoristas`, `temporadas`→`paquetes`, `precios`→`temporadas`) son compuestas. La migración aborta si queda alguna simple y la aserción 54 barre el catálogo. En Neon: cero simples |
| `Paquete` + `Temporada` + `Precio` siguen en el esquema junto al modelo nuevo | `datos` | El cotizador actual todavía se apoya en ellos. Se retiran cuando el cotizador pase a `resolverVigencia` |
| ~~La API no expone todavía `vigencias` ni `tarifas`~~ **HECHO**: `GET /api/v1/catalogo/salidas` y `POST /api/v1/catalogo/cotizar`, con 22 pruebas de extremo a extremo. Faltan las rutas de **escritura** | `backend` | Sin alta de tarifas por API, el catálogo solo se carga por semilla |

---

## Integración del 2026-10-13 — v0.18.0

**Dos ramas entran, dos se devuelven.** Registro completo:
[`docs/_integraciones/2026-10-13-v0.18.0.md`](docs/_integraciones/2026-10-13-v0.18.0.md).

| Rama | Veredicto | Versión |
|---|---|---|
| `chore/orden-en-la-raiz` | **Integrada** (`23e239e`) | sin etiqueta: no cambia el artefacto desplegable |
| `docs/adr-0009-parametrico` @ `49278fe` | **Integrada** (`fa73c4d`) | **v0.18.0** |
| `feat/inbox-esquema` | **DEVUELTA** | — |
| `feat/bandeja-web` | **DEVUELTA** | — |

Compuertas de las dos integradas, corridas por el integrador: `build` **5/5 forzado sin caché** ·
`typecheck` **7/7** · `lint` **7/7** · `format:check` limpio · pruebas: contracts **56**,
domain **70**, api **150** y aislamiento **39/39** contra Neon.

**Se integró con la tarea `test` en rojo, y hay que decirlo claro.** No por el contenido de las
ramas: por el arnés. Ver tarea 0. Las 39 aserciones de aislamiento pasan; lo que falla es el
desmontaje de la suite, que deja sus fixtures y rompe la corrida siguiente. Una de las dos ramas
integradas no contiene código. **La excepción vale una vez: hasta que la tarea 0 esté cerrada, no
entra nada más.**

De `docs/adr-0009-parametrico` se integró el commit medido `49278fe`, **no la punta de la rama**:
su sesión seguía escribiendo durante la revisión, y el commit siguiente (`a408407`) es trabajo del
inbox dentro de una rama de quoting.

### Por qué volvió `feat/inbox-esquema`

Lo de la vuelta anterior está corregido y comprobado: `lint` 7/7 y ningún UUID corto. Lo que la
detiene es de hoy y es de aislamiento, donde no aplica la regla de una sola vuelta (R13):
`aislamiento.spec.ts:1614` borra `canales` antes que las filas de `enrutamiento_canales` que lo
referencian con `ON DELETE RESTRICT`. El desmontaje revienta y los fixtures sobreviven.

Consecuencia sobre su propia cifra: afirma **50/50** y hoy da **30 pasadas y 20 saltadas** — el
bloque del inbox entero cae en su `beforeAll` con `duplicate key` sobre
`plantillas_whatsapp_tenant_id_cuenta_id_nombre_idioma_key`. Veinte aserciones que nadie ha visto
ejecutarse.

### Por qué volvió `feat/bandeja-web`

Sin entrar en su contenido: **15 commits por detrás de `main`**, 63 por delante, 89 archivos y
+17.052 líneas, y todavía escribiéndose. El modelo de ramas dice que la rama atrasada se pone al
día antes de pedir integración, y que una rama que nadie puede revisar se parte. No se tocó su
árbol de trabajo.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| **La migración de ADR-0009 se aplicó a Neon antes de pasar por la compuerta.** Mientras duró, `main` hablaba de `salidas` contra una base que ya solo tenía `vigencias`, y los otros tres árboles de trabajo con ella | `datos` | Se resuelve solo al integrar el código que la acompaña. El precedente es malo y por eso queda escrito: aplicar esquema desde una rama sin integrar rompe a todos los demás |
| **Renombrar una tabla no es una migración segura en caliente.** `salidas` → `vigencias` deja ciega a la versión anterior en ejecución. Hoy no hay nada desplegado; cuando lo haya, toca el patrón de dos pasos (vista o columna nueva, despliegue, retirada) | `arquitecto` | No hay servidor. Pero la primera vez que lo haya, esto es una caída |
| El prefijo `docs/` de `docs/adr-0009-parametrico` miente: la rama trae migración, rutas de API, dominio y contratos | `facilitador` | Se integró por su contenido. El nombre es barato de acertar la próxima vez |
| `.prettierignore` sigue ignorando `images/`, una carpeta que ya no existe | `devops` | Ruido inofensivo |
| El `typecheck` da un rojo falso (`Property 'vigencia' does not exist on type 'ClienteTenant'`) cuando `build` es un acierto de caché de Turbo y no regenera el cliente de Prisma. Turbo no declara `generate` como dependencia de `typecheck` | `devops` | Se resuelve con `pnpm --filter @viajapro/database generate`. Ya estaba en la cola desde el 2026-10-11; hoy volvió a morder |


---

## 2026-10-13 (noche) — lo que pasó después de la v0.18.0

### La tarea 0 está cerrada, y medida como había que medirla

El `integrador` integró con la compuerta de pruebas en rojo y lo declaró como excepción. Tenía
razón en el diagnóstico: **la suite se envenenaba a sí misma**. Su `afterAll` hacía
`DELETE FROM tenants` a secas, chocaba contra el `RESTRICT` de `enrutamiento_canales` hacia
`cuentas_whatsapp`, el borrado no se completaba y los tres tenants de fixture sobrevivían. La
corrida siguiente moría con `duplicate key` en diecisiete aserciones que no tenían nada que ver
con el aislamiento.

Reparado en `4f08d25`. `scripts/borrar-tenants.mjs` **descubre** el orden de borrado en vez de
codificarlo, y barre toda columna `uuid` con `tenant` en el nombre —no solo `tenant_id`—. Lo usan
el `afterAll` y `limpiar-fixtures.mjs`: un solo sitio, para que no haya una versión buena y otra
que se queda vieja. Y `pnpm test` del paquete limpia antes de correr, porque la higiene no puede
depender de que alguien se acuerde.

**Prueba: dos corridas seguidas sin tocar nada entre ellas. 39/39 las dos, y la segunda arranca
con la base limpia.** También se borraron 213 filas de residuo que ya estaban en Neon.

### Las foráneas del catálogo llevan el tenant dentro

`auditor-seguridad` ejecutó contra Neon tres escrituras cruzadas que la foránea simple permitía:
colgar una tarifa de la vigencia de otra agencia, mover una tarifa a la vigencia ajena, y colgar
una vigencia del paquete de otro. **Y desmontó el motivo por el que yo lo había aplazado:** escribí
«es un barrido de todo el esquema, no de una tabla suelta» y contó 38 foráneas compuestas contra 6
simples. `inbox` y `crm` ya eran compuestas, con dos aserciones probando ese ataque.

Migración `20261013230000`. Los tres ataques ahora rebotan con `23503`, comprobado. Una trampa
esquivada por el camino: la foránea al mayorista era `SET NULL`, y una **compuesta** con `SET NULL`
pone a `NULL` también `tenant_id`, que es `NOT NULL` — PostgreSQL acepta el DDL y revienta en
ejecución.

### La cotización es una suma, no una tarifa

`experto-turismo` encontró una mina: el cotizador **preguntaba la composición de pasajeros y
después la ignoraba**. Una tarifa `POR_PERSONA` se cobraba al grupo entero, fuera cual fuera su
`tipoPasajero`. Una familia de dos adultos y un niño habría salido a **$876.000** —«Menor × 3»,
marcada como recomendada por ser la más barata— cuando lo correcto son **$1.070.000**. Con el
margen del 20 %, eso es vender por debajo del costo.

No disparaba porque el tarifario real son pasadías sin tarifa de menor. Habría disparado con el
primer paquete con hotel.

La respuesta de cotizar lleva ahora `lineas` —una por tipo de pasajero—, `total`, `alternativas`
de grupo que **no se aplican solas**, y `noAplicables` **con su motivo**. `recomendada` pasó a
llamarse `masBarata`, porque la opción más barata es casi por definición la de peor margen.

### Cola — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| **El `margen` que devuelve cotizar ES el neto**: `neto = venta − margen`. Y `TarifaPublica`, el contrato escrito para impedirlo, **no lo importa nadie** | `backend` | No hay superficie de cara al viajero y toda ruta exige sesión. **Dependencia dura: no entra la primera pieza para el viajero sin partir la respuesta en interna y pública** |
| `politicaDePrecio.findFirst()` sin `where` acierta hoy por RLS; con otro rol o fuera de contexto devuelve la política de otra agencia **sin error** | `backend` | Verificado que hoy devuelve lo correcto. Cuesta una línea |
| `vigencias`, `tarifas` y `politicas_de_precio` no tienen **ni una aserción de comportamiento** en `aislamiento.spec.ts` | `qa` | Cobertura estructural sí. Pero el día que alguien quite la foránea compuesta, nada se pondrá en rojo |
| **La salida no tiene fecha de regreso**: la hereda del paquete. Las cuatro super excursiones salen en días distintos y vuelven el mismo | `arquitecto` | Roto hoy con el dato de hoy, pero el cliente aún no lo ve. «¿Y volvemos cuándo?» es la segunda pregunta de todo viajero |
| **No existe la ciudad de ORIGEN** de la salida, y la hoja real mezcla orígenes: Nevado del Ruiz y Buenaventura el mismo domingo no salen del mismo sitio | `arquitecto` | Hoy se duplicaría el paquete por ciudad, que rompe paquete-como-plantilla |
| `neto` y `venta` obligados a la **misma moneda**: el mayorista de producto internacional cotiza en USD y la agencia vende en COP | `arquitecto` | Los 47 productos son terrestres y en COP. Candidato a bloqueante en el mes dos |
| **Impuestos sin base gravable.** `experto-turismo` levantó la bandera y declaró no conocer el detalle | `investigador` | Afecta a la factura electrónica, no al cotizador. Fuente: el contador de la agencia piloto |
| Nombres de dominio: `CLAUDE.md` exige **inglés** y el esquema entero está en **español** | `arquitecto` | Hay que cambiar la regla o el código. No se tocó ninguna de las dos |

---

## Integración del 2026-10-19 — v0.19.0

`docs/adr-0009-parametrico` @ `f57925b` entra en `main` (`3b53943`), etiquetada **v0.19.0**.
Registro: [`docs/_integraciones/2026-10-19-v0.19.0.md`](docs/_integraciones/2026-10-19-v0.19.0.md).

Compuertas, corridas por el integrador sobre el árbol fusionado (idéntico a la punta: la rama
estaba 0 por detrás): `install --frozen-lockfile` limpio · `typecheck` **9/9 sin caché** ·
`lint` **7/7 sin caché** · `format:check` limpio · `build` **5/5 sin caché** · pruebas: contracts
**56**, domain **70**, api **218** (16 archivos, e2e incluidas) y aislamiento **39/39**.
**Aislamiento en verde tres veces seguidas** contra Neon, sin limpieza manual y sin residuo entre
corridas. **La tarea 0 queda cerrada y la compuerta de pruebas vuelve a ser compuerta.**

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| **El shell del usuario exporta un `DATABASE_URL` de OTRO proyecto (`TrastornadoresApp`, otro endpoint de Neon) y `dotenv-cli` no lo pisa.** La primera corrida de `pnpm test` lanzó `limpiar-fixtures.mjs --borrar` **con rol propietario contra esa base ajena**; se salvó porque allí no existe `tenants`. Arreglo: `dotenv -o` en los scripts del paquete, o que `limpiar-fixtures` aborte si `current_database()` no es la esperada | `devops` (+ Usuario: quitar la variable del perfil) | El filtro por prefijo y edad acota lo borrable; y con `env -u DATABASE_URL` todo corre contra la base correcta. **Es de hoy, pero el daño posible es pequeño y no es de aislamiento entre agencias** |
| ~~Neon tiene aplicadas tres migraciones que no están en `main` (`20261011090000…090200`)~~ | `datos` | **Resuelta en v0.20.0:** ya están en `main`; `migrate status` da 15 migraciones y ninguna deriva |
| La rama mezcla propósitos (`a408407` es inbox en una rama de quoting) y su prefijo `docs/` sigue mintiendo; además se integró **dos veces** con el mismo nombre | `facilitador` | Se integró por su contenido y por desbloquear la tarea 0. La rama no se borró porque el árbol `D:\Projects\CRM-api` la tiene activa: **su sesión debe abrir rama nueva desde `main`** |
| `semilla-catalogo-real.ts` calcula la venta del menor con `* 0.75` en coma flotante (R8) | `datos` | Es semilla, redondeada a miles; no es cálculo de producción |
| `catalogo.e2e-spec.ts` redefine a mano el tipo de la respuesta (`desdeEsDeGrupo: boolean`) en vez de inferirlo del contrato (R3) | `qa` | Solo en la prueba; si el contrato cambia, la aserción lo detecta igual |

---

## Integración del 2026-10-19 (segunda) — v0.20.0

`feat/inbox-esquema` @ `d30b256` entra en `main` (`533c5d4`), etiquetada **v0.20.0**. Registro:
[`docs/_integraciones/2026-10-19-v0.20.0.md`](docs/_integraciones/2026-10-19-v0.20.0.md).

Compuertas sobre el árbol fusionado (idéntico a la punta; 0 por detrás de `2905e05`), siempre con
`env -u DATABASE_URL -u DIRECT_URL` y `current_database() = neondb` comprobado: `typecheck` **9/9**,
`lint` **7/7**, `build` **5/5**, los tres sin caché · `format:check` limpio · pruebas: contracts **56**,
domain **70**, api **218**, aislamiento **50/50** — **tres corridas seguidas, cero saltadas, sin
residuo**. La tarea 4a queda cerrada.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~Las tres migraciones del inbox se fechan `20261011…` y nadie había reconstruido el esquema desde cero~~ | `datos` | **Resuelta (2026-10-19):** el CI reconstruye las 18 desde cero en un Postgres 16 limpio y queda en verde |
| 4a.1 sigue abierta: los jobs `aislamiento-tenants` y `test` nunca han corrido en CI | `devops` | La compuerta local está en verde y medida tres veces |

---

## Integración del 2026-10-19 (tercera) — sin etiqueta

`feat/inbox-webhook-post` @ `78e74cc` entra en `main` (`539c581`). Solo añade la prueba e2e del
`POST` y su bitácora: **no cambia el artefacto desplegable, no lleva versión.** Registro:
[`docs/_integraciones/2026-10-19-inbox-webhook-post.md`](docs/_integraciones/2026-10-19-inbox-webhook-post.md).

Compuertas en un árbol de trabajo **limpio** en `78e74cc` (el de `D:\Projects\CRM-api` tenía trabajo
sin commitear de `feat/inbox-relay`, así que la primera corrida no contó): `typecheck` 9/9, `lint`
7/7, `build` 5/5, sin caché · `format:check` limpio · contracts 56, domain 70, api **224**,
aislamiento **50/50 dos veces seguidas**.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| Durante las corridas había **4** tenants de fixture vivos de otra sesión (no múltiplo de 3: posible corrida muerta a medias). La limpieza los respetó por edad y la suite pasó igual | `datos` | Si en 15 min no desaparecen, los barre la siguiente corrida |
| Queda el directorio `D:\Projects\CRM-gate` (árbol temporal del integrador, ya desregistrado y sin `.env`): el borrado fue denegado | Usuario | Solo contiene `node_modules` y copia del código; borrarlo a mano |

---

## Integración del 2026-10-19 (cuarta) — v0.21.0

`feat/inbox-relay` @ `99eb149` entra en `main` (`b12bc4f`), etiquetada **v0.21.0**. Registro:
[`docs/_integraciones/2026-10-19-v0.21.0.md`](docs/_integraciones/2026-10-19-v0.21.0.md).

Compuertas sobre el **árbol fusionado**, en un árbol de trabajo limpio (el commit de merge tiene
exactamente el árbol probado): `typecheck` 9/9, `lint` 7/7, `build` 5/5, sin caché · `format:check`
limpio · `pnpm run test --force` **dos veces**: contracts 56, domain 70, api **258**, aislamiento
**50/50** las dos, con `api` y `database` corriendo en paralelo.

### Los cuatro puntos que había que juzgar

1. **El trabajador vive en `apps/api`, no en `apps/worker`.** No bloquea: es otro proceso
   (`src/worker.ts`), con su propio módulo y su propio rol, y no comparte `PrismaService` con la API.
   Pero el mapa de `CLAUDE.md` §5 y el ADR-0004 dicen otra cosa, y eso es una afirmación que el código
   ya no cumple. Va a cola del `arquitecto`, que decide: o un ADR que lo acepte y corrija el mapa, o
   mover el trabajador a `apps/worker` cuando se extraiga el paquete.
2. **BullMQ real sin verificar.** Basta para integrar: no hay nada desplegado, la idempotencia está en
   el `jobId` y en `ProcesarChange` (probados), y si falla el encolado el POST devuelve 500 y Meta
   reintenta sobre una fila ya durable. Queda en 4c: verificarlo con `pnpm infra:up` y en CI antes del
   primer despliegue.
3. **Dependencias justificadas:** `bullmq` es la cola del ADR-0001; `ioredis` la exige BullMQ 6
   aparte; `pg` y `@types/pg` son solo de desarrollo, para la e2e, como en `packages/database`.
4. **El `afterAll` de `aislamiento.spec.ts` borra `recepciones_webhook` entera.** Está en `main`
   desde antes, no en esta rama. No se manifestó: dos corridas con las pruebas de `api` y `database`
   en paralelo. Cola de `qa`.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| Trabajador en `apps/api` contra el mapa de `CLAUDE.md` | `arquitecto` → Usuario | **Decidido en el ADR-0010.** Falta la línea del mapa en `CLAUDE.md` §5, que la aprueba el propietario aparte |
| ~~Revisión de `auditor-seguridad` sobre `ProcesarChange` y `conTenantResuelto`~~ | `auditor-seguridad` | **Cerrada (v0.21.2):** sin bloqueantes; tres correcciones integradas |
| BullMQ contra Redis real, y el job de CI | `devops` (4c, 4a.1) | Nada desplegado; ruta probada con dobles |
| ~~Sin relay de barrido~~ | `datos` | **Cerrado en v0.30.0** |
| `aislamiento.spec.ts` borra toda `recepciones_webhook` en su `afterAll` | `qa` | No se manifestó en dos corridas en paralelo |
| `.env.example`: la rama reescribió el archivo entero por finales de línea (345 líneas en el diff, 3 de contenido). Falta `.gitattributes` | `devops` | Solo ruido en el diff |
| `D:\Projects\CRM-gate2`: otro árbol temporal del integrador sin borrar (desregistrado, sin `.env`) | Usuario | Borrar a mano junto con `CRM-gate` |

---

## Integración del 2026-10-19 (quinta) — v0.21.1

`fix/datos-canal-revocado` @ `1739694` entra en `main` (`f77906a`), etiquetada **v0.21.1**. Registro:
[`docs/_integraciones/2026-10-19-v0.21.1.md`](docs/_integraciones/2026-10-19-v0.21.1.md).

La rama iba 6 por detrás. Se fusionó con `aac69bf` en un árbol limpio y ahí se repitió todo (el
merge tiene el árbol probado): `typecheck` 9/9, `lint` 7/7, `build` 5/5, sin caché · `format:check`
limpio · `pnpm run test --force` dos veces: 56 · 70 · api **258** · aislamiento **51/51** las dos,
con entre 6 y 11 tenants de fixture de otras sesiones vivos a la vez.

**Migración.** `_prisma_migrations` tiene dos filas para `20261019120000`: el primer intento, con
`rolled_back_at` puesto, y el bueno, cuya `checksum` coincide con el archivo de la rama
(`9a5a808c…`). `migrate status`: 16 migraciones, al día. La función `propagar_estado_canal` es
`SECURITY DEFINER`, propiedad de `viajapro_enrutador`, sin `EXECUTE` para nadie más; filtra por
`tenant_resuelto_id = NEW.tenant_id`, así que una agencia solo puede restringir sus propias filas.

**El interbloqueo de la aserción 22 es del arnés, no un defecto.** La 22 reaplica `001`/`002` —DDL
de privilegios sobre todo el esquema— y choca con otra corrida que hace lo mismo sobre la misma
base. No se reprodujo en dos corridas con otras sesiones activas. Va a `qa`.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| La aserción 22 puede interbloquearse con otra corrida simultánea (DDL de privilegios contra una base compartida). Encaja con 4i y con 0c: serializar con `pg_advisory_lock` o una base por árbol | `qa` | Es del arnés; no se reprodujo en dos corridas |
| **`D:\Projects\CRM\.env` y `CRM-inbox\.env` no tienen `WHATSAPP_DIRECTORY_PEPPER` ni `WEBHOOK_PAYLOAD_KEY`**: desde v0.21.0, `pnpm test` cae en `inbox-relay.e2e-spec` en esos árboles (visto hoy: 253 pasadas y 5 saltadas). Solo `CRM-api` puede correr la compuerta completa | Usuario (copiar las variables; nunca por el chat) | El código está bien y `.env.example` las declara; lo que falta es la configuración local |
| Las e2e de `apps/api` se cargan desde `.env` sin `-o` y heredan el `DATABASE_URL` del shell. El integrador consultó una vez, solo en lectura, la base ajena por eso | `devops` | Ya estaba en la cola del 2026-10-19 (primera) |
| `D:\Projects\CRM-gate3`: tercer árbol temporal sin borrar | Usuario | Junto con `CRM-gate` y `CRM-gate2` |

---

## Integración del 2026-10-19 (sexta) — v0.21.2: la auditoría del trabajador, cerrada

`fix/inbox-auditoria-trabajador` @ `a30db6b` entra en `main` (`b17aa34`), etiquetada **v0.21.2**. Registro:
[`docs/_integraciones/2026-10-19-v0.21.2.md`](docs/_integraciones/2026-10-19-v0.21.2.md).

**`auditor-seguridad` auditó el trabajador de v0.21.0 y no encontró bloqueantes. Las tres correcciones
que pidió están integradas:**

1. **R10:** `ErrorDeTrabajo` deja en `failedReason` y en el registro solo `Clase:código`. BullMQ
   guarda ese motivo siete días en Redis, sin RLS ni cifrado. Una prueba fuerza PII y comprueba que no sale.
2. `FOR SHARE` al leer el canal: una revocación concurrente espera a que termine la escritura.
3. Dos e2e contra Neon: un lote con `changes` de dos agencias, y el mismo `wamid` en dos tenants.

Compuertas sobre el árbol fusionado con `b93fa75` (iba 3 por detrás), en un árbol limpio:
`typecheck` 9/9, `lint` 7/7, `build` 5/5, sin caché · `format:check` limpio · `pnpm run test --force`
dos veces: 56 · 70 · api **263** (`inbox-relay.e2e-spec` 7/7) · aislamiento **51/51** las dos.

Cola: nada nuevo. `D:\Projects\CRM-gate4` se suma a los árboles temporales que hay que borrar a mano.

---

## Integración del 2026-10-19 (séptima) — ADR-0010, sin etiqueta

`docs/adr-0010-enmienda-0008` @ `9cdda1e` entra en `main` (`cf2296d`). Solo toca cinco `.md` de `docs/`:
no cambia el artefacto desplegable, así que no lleva versión. Registro:
[`docs/_integraciones/2026-10-19-adr-0010.md`](docs/_integraciones/2026-10-19-adr-0010.md).

Fue **devuelta una vez**: en `0ee9a52` cambiaba una línea de `CLAUDE.md`. Ese archivo solo cambia con
aprobación del propietario, y ningún mensaje de agente la sustituye. En `9cdda1e`, `CLAUDE.md` es
idéntico a `main`. La línea del mapa se le pide al propietario aparte.

**El ADR-0010 se aceptó en modo desatendido y falta que el propietario lo ratifique.** `auditor-seguridad` lo
revisó (ACEPTAR CON CAMBIOS), y los dos cambios están aplicados.

### Cola nueva — con dueño, no bloquea (según `auditor-seguridad`)

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~No existe el relay de barrido~~ | `datos` | **Cerrado en v0.30.0:** `listar_changes_pendientes` y el barrido del trabajador, que reencola los `changes` pendientes |
| ~~Falta el puerto `asegurarContacto`: `inbox` escribía en `contactos` directamente (R4)~~ | `backend` | **Cerrado en v0.30.1** |
| ~~Tres huecos del disparador `canales_propagar_estado`~~ | `datos` | **Cerrados en v0.32.0**, con el cuarto (INSERT): baja de cuenta (`propagar_estado_cuenta`), `eliminado_en` tratado como REVOCADO, y un re-alta que no puede relajar el estado del canal |
| Ratificar el ADR-0010, y aprobar la línea del mapa en `CLAUDE.md` §5 | Usuario | Hoy describe el código tal como está |

---

## Integración del 2026-10-19 (octava) — v0.22.0: el esquema de cotizaciones

`feat/quoting-cotizaciones-esquema` @ `1effb16` entra en `main` (`862d265`), etiquetada **v0.22.0**. Registro:
[`docs/_integraciones/2026-10-19-v0.22.0.md`](docs/_integraciones/2026-10-19-v0.22.0.md).

Es de aislamiento, y se verificó como tal. La rama se fusionó con `5618bc2` (iba 5 por detrás) en un
árbol limpio con el `.env` completo, y el merge tiene el árbol probado. Resultados: `typecheck` 9/9,
`lint` 7/7, `build` 5/5, sin caché · `format:check` limpio · `pnpm run test --force` dos veces: 56 · 70 ·
api 263 · aislamiento **57/57**. **Mutaciones 13/13 en rojo**, con su control previo en verde, y después
una tercera corrida de aislamiento 57/57 para confirmar que la base volvió a su estado bueno.
`migrate status`: 18 migraciones, al día; las dos nuevas aplicadas con la `checksum` del archivo.

**La vía de escape de la purga, comprobada en Neon.** El disparador deja borrar una versión solo si
`current_user` es el propietario de la tabla (`neondb_owner`) **y** el tenant está en
`viajapro.purga_de_tenants`. Cualquier rol puede fijar ese parámetro, porque es un GUC personalizado.
Por eso no protege él: protege la primera condición. Ningún rol `viajapro_*` es miembro del
propietario, ni tiene `SUPERUSER`, `BYPASSRLS` o `CREATEROLE`. La función es `SECURITY INVOKER`, y no
existe ninguna función `SECURITY DEFINER` del propietario por la que un rol de app pueda ejecutar como él.
**`viajapro_app` puede fijar el parámetro, pero no puede activar la purga.**

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| Los roles de app tienen `UPDATE`/`DELETE` concedidos sobre `versiones_cotizacion`, y los frena solo el disparador (M11 lo prueba). Quitarlos daría una segunda capa | `datos` | El disparador está probado por mutación |
| `mutaciones-aislamiento.mjs` rompe el aislamiento **en la base compartida**: durante su corrida, las suites de los otros árboles pueden ver rojos falsos | `qa` / `devops` (0c) | Revierte siempre, y solo hay datos de prueba |
| `D:\Projects\CRM-gate5`: otro árbol temporal | Usuario | Borrar a mano con los demás |

---

## Integración del 2026-10-19 (novena) — v0.23.0: guardar cotizaciones

`feat/quoting-guardar-cotizacion` @ `c8121ee` entra en `main` (`3d9b07a`), etiquetada **v0.23.0**. Registro:
[`docs/_integraciones/2026-10-19-v0.23.0.md`](docs/_integraciones/2026-10-19-v0.23.0.md).

La rama iba 0 por detrás de `860d335`. Las compuertas se corrieron en un árbol limpio con el `.env`
completo, y el merge tiene el árbol probado: `typecheck` 9/9, `lint` 7/7, `build` 5/5, sin caché ·
`format:check` limpio · `pnpm run test --force` dos veces: contracts **60**, domain 70, api **279**
(`cotizaciones.e2e-spec` 9/9) y aislamiento **57/57**.

**`incluirMargen` no tiene control de rol, confirmado.** El controlador lo lee de la query
(`v === 'true'`) y lo pasa tal cual al caso de uso, sin mirar quién pide. Hoy no hay autenticación,
y el tenant llega por cabecera, solo con `APP_ENV=local`. Va ligado a la tarea 12.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~`incluirMargen` sin control de rol~~ | `backend` | **Cerrado en v0.34.0:** sin el permiso «ver neto y margen», 403 `PERMISO_DENEGADO` (`autorizarMargen()` en cotizaciones y en `POST /catalogo/cotizar`) |
| ~~Listado, envío y estados de la cotización~~ | `backend` | **Hecho en v0.25.0**: listado por cursor y máquina de estados. Queda el envío por WhatsApp |
| ~~El filtro de errores responde 400 a `*_NO_ENCONTRADA`~~ | `backend` | **Resuelto en v0.25.0**: 404 para `_NO_ENCONTRADA` y `_NO_ENCONTRADO` |
| ~~`quoting` leía `contactos` y `oportunidades` de `crm` directamente (R4)~~ | `arquitecto` | **Cerrado en v0.30.1** |
| `D:\Projects\CRM-gate6`: otro árbol temporal | Usuario | Borrar a mano |

---

## Integración del 2026-10-19 (décima) — el primer CI en verde, sin etiqueta

`ci/primer-verde` @ `33283a5` entra en `main` (`d56f06c`). Toca el CI, `turbo.json`, la configuración de
gitleaks, una prueba y la bitácora. **No cambia el artefacto desplegable, así que no lleva etiqueta.**
Registro: [`docs/_integraciones/2026-10-19-ci-primer-verde.md`](docs/_integraciones/2026-10-19-ci-primer-verde.md).

La compuerta es la corrida https://github.com/Alfavear/CRM/actions/runs/39308173658, sobre la punta exacta: 8 jobs en success (`secretos`, `typecheck`,
`lint`, `build`, `test`, `aislamiento-tenants`, `fronteras-entre-modulos` y `politica-de-rama`), con
Postgres 16 y Redis 7 limpios.

**Se devolvió una vez.** Uno de los dos «falsos positivos» de gitleaks era el `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
real, que la lista blanca habría ocultado para siempre. Ahora la prueba genera el suyo, y el
historial se ignora **solo** por la huella `94bf78f…:verificacion-suscripcion.spec.ts:generic-api-key:4`.
El valor ya no aparece en ningún archivo rastreado de `main`.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~BullMQ real sigue sin probar~~ | `devops` | **Cerrado (`897d8df`):** `inbox-bullmq.e2e-spec.ts` corre con Redis 7 en el CI —ejecutada, no saltada, run 39339999694— y cubre `jobId`, el reintento sin duplicar, el consumidor hasta `mensajes` y un `failedReason` sin PII |
| Protección de rama con estos checks como obligatorios | Usuario (**tarea 10**) | El plan gratuito no la permite en repos privados |
| `convencion-de-commits` sale *skipped*, porque solo corre en PR, y la integración aquí es por merge local | `devops` | La convención la revisa el integrador a mano |

---

## Integración del 2026-10-19 (undécima) — `fix/gitleaksignore-rotado`, sin etiqueta

`fix/gitleaksignore-rotado` @ `20da8ef` entra en `main` (`d806804`). Solo cambia el comentario de
`.gitleaksignore`: la huella es la misma. No lleva etiqueta.
Registro: [`docs/_integraciones/2026-10-19-gitleaksignore-rotado.md`](docs/_integraciones/2026-10-19-gitleaksignore-rotado.md).

- **La rotación del token está verificada**: el valor viejo no aparece en ninguno de los cuatro `.env`.
  El bloqueo de §4 queda cerrado.
- **11b, a medias**: `META_APP_SECRET` tiene valor solo en `D:\Projects\CRM\.env`.
- **El Paso 2 de Meta —configurar el webhook— espera a que haya despliegue o túnel.** Exige una URL
  pública, y hoy no la hay. Hasta entonces el `POST` real de Meta no llega; el verificado es el
  de las pruebas e2e.

---

## 2026-10-19 — cierre documental: secretos locales alineados

**11b cerrada.** Los cuatro `.env` tienen `META_APP_SECRET`, `WHATSAPP_DIRECTORY_PEPPER`, `WEBHOOK_PAYLOAD_KEY` y
`WEBHOOK_PAYLOAD_KEY_VERSION=1`. En cada variable, el valor es el mismo en los cuatro: lo comprobé por hash,
sin imprimir valores. La pimienta y la clave son las que ya usaba la base, copiadas desde `CRM-api`.
Con esto, la compuerta completa (`inbox-relay.e2e-spec`) se puede correr desde cualquier árbol.

### Cola nueva — con dueño, no bloquea

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~`generar-secretos-locales.ps1` podía pisar la pimienta buena~~ | `devops` | **Cerrado (`897d8df`):** copia el valor existente antes de generar, aborta (salida 2) si los árboles tienen valores distintos, y solo genera si no lo tiene ninguno |

---

## Integración del 2026-10-19 (duodécima) — v0.24.0: la bandeja web, tanda 1 (base)

`feat/web-tanda-1-base` @ `420e88a` entra en `main` (`cd35a3d`), etiquetada **v0.24.0**. Registro:
[`docs/_integraciones/2026-10-19-v0.24.0.md`](docs/_integraciones/2026-10-19-v0.24.0.md).

**La rama la armó el integrador, pero el contenido no es suyo.** Se creó desde `origin/main` y solo
trae rutas de `814ae24` (`feat/bandeja-web`, revisada y aceptada), con `git checkout 814ae24 -- <rutas>`.
Se comprobó que los doce archivos son byte a byte los de `814ae24`. No se tocó `D:\Projects\CRM-bandeja`.

**La frontera se movió:** la búsqueda global, el panel de notificaciones y el distintivo de datos demo
**no** entran en la tanda 1, porque importan los mocks de todas las áreas y `crm-api`. Irán en la
tanda 4. La portada enlaza a rutas que llegan en las tandas 2 a 4: hasta entonces, esos enlaces dan 404.

Compuertas: `install --frozen-lockfile` limpio · `typecheck` 9/9, `lint` 7/7, `build` 5/5, sin caché ·
`format:check` limpio · `pnpm run test --force` **cuatro veces**: dos en verde completo (contracts 60,
domain 70, **web 4**, api 279, aislamiento 57/57) y dos con un rojo cada una, **los dos del arnés**.

### Los dos rojos, mirados

1. `inbox-relay.e2e-spec`, «el mismo wamid en un lote DISTINTO»: `NO_ENCONTRADO` en vez de `PROCESADO`.
   **Causa: `aislamiento.spec.ts:646` hace `DELETE FROM recepciones_webhook` sin filtro**, y turbo
   corre `api:test` y `database:test` a la vez: la suite de aislamiento le borra la recepción a la e2e.
   Es la cola de `qa` de la v0.21.0, **que ya se manifiesta**.
2. Aserción 22: `deadlock detected` al reaplicar `001`/`002`. Es la cola de `qa` de la v0.21.1.

### Cola — sube de prioridad

| Cola | Dueño | Por qué no bloquea, y hasta cuándo |
|---|---|---|
| ~~El arnés falla una de cada dos corridas~~ | `qa` | **Resuelta (`5ead5fe`):** borrados y purgas acotados a la corrida, la 22 serializada con advisory lock, y una guarda que impide las mutaciones contra una base no desechable |
| La portada enlaza a `/bandeja`, `/catalogo`, `/pipeline`… antes de que existan en `main` | integrador (tandas 2–4) | No hay nada desplegado; se cierra con la tanda 4 |
| R3: `apps/web/src/lib/mock-viajes.ts:12` redefine `TipoPasajero` (`'ADT' | 'CHD' | 'INF'`), que ya existe en `packages/contracts/src/catalogo.ts` con otros valores | Antigravity | No está en la tanda 1. **Bloquea la tanda 4** si sigue así |

---

## Incidente del 2026-10-19 — las mutaciones de aislamiento corrieron contra Neon compartido

**Qué pasó.** `mutaciones-aislamiento.mjs` rompe el aislamiento a propósito, una rotura cada vez, y lo
restaura. Se ejecutó contra la base **compartida**. Según `qa`, hubo unos **4 minutos** con la foránea
de cotizaciones sin `tenant_id` y RLS apagada en `cotizaciones`. Eso explica que la aserción 39 de
otra corrida aceptara un `INSERT` cruzado. **No cruzó ninguna fila de negocio**: en esa base solo hay
datos de prueba y la agencia demo.

**Lo que tiene que constar.** El integrador corrió esas mutaciones contra Neon compartido durante la
integración de v0.22.0. Lo anotó en su registro y en la cola de `qa`/`devops`, pero lo correcto era no ejecutarlas.
Que aquella corrida sea o no la de los 4 minutos que midió `qa`, el fallo de criterio es el mismo:
**una herramienta que rompe el aislamiento no se ejecuta contra una base que usa nadie más**.

**Qué lo impide ahora.** `scripts/guarda-base-desechable.mjs` (`5ead5fe`): las mutaciones exigen
`VIAJAPRO_BASE_DESECHABLE=1`, y se niegan a correr si el host es de Neon o la base se llama `neondb`
fuera de loopback. **Desde hoy, la compuerta de aislamiento de cada integración es el CI**, sobre una
base limpia.

## Integración del 2026-10-19 (decimotercera) — `fix/qa-arnes-paralelo`, sin etiqueta

`fix/qa-arnes-paralelo` @ `835d2a6` entra en `main` (`5ead5fe`). Solo toca pruebas y scripts de prueba,
así que no lleva etiqueta. Compuerta: rama `chore/compuerta-qa-arnes` (origin/main + la rama), con CI
**8/8 en verde**: https://github.com/Alfavear/CRM/actions/runs/39336470606. El merge tiene el árbol que
probó el CI. Estáticas en local, sin caché: `typecheck` 9/9, `lint` 7/7, `build` 5/5, `format:check` limpio.
La suite sigue con 57 `it` y pasa de 163 `expect` a 164: no se quitó ninguna aserción, se envolvieron
en el bloqueo.


## Integración del 2026-10-19 (decimocuarta) — v0.24.1: la política solo con el margen (R10)

`fix/quoting-politica-solo-con-margen` @ `b06f88b` entra en `main` (`8fcb35a`), etiquetada **v0.24.1**.
Con la base, el porcentaje y la venta se despejaba el neto (`venta / (1 + %)`). Ahora `politica` solo
viaja con `incluirMargen=true`, y la e2e comprueba que una respuesta sin margen no contiene ni neto,
ni margen, ni política. Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39337042919,
sobre el árbol del merge. Estáticas en local en verde. Registro:
[`docs/_integraciones/2026-10-19-v0.24.1.md`](docs/_integraciones/2026-10-19-v0.24.1.md).

## Integración del 2026-10-19 (decimoquinta) — v0.25.0: listado y estados de cotizaciones

`feat/quoting-listado-y-estados` @ `e96e0ff` entra en `main` (`f6fb562`), etiquetada **v0.25.0**. Trae
`GET /api/v1/cotizaciones` con cursor y filtros (devuelve 400 si se pide `incluirMargen`), y
`POST /:id/estado` con BORRADOR→ENVIADA→ACEPTADA|RECHAZADA|VENCIDA, donde los estados terminales dan 409.
El filtro de errores ya da 404 a los `_NO_ENCONTRADA`/`_NO_ENCONTRADO`. **Fusionada sobre la v0.24.1:
`FilaDeCotizacion` no lleva `politica`, ni `neto`, ni `margen`**, y el SQL del listado no lee esas columnas.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39337507750, sobre el árbol del merge.
Estáticas en local en verde. Antes, contra Neon compartido, la api dio 318/318 en cuatro corridas,
con la e2e de dos agencias de inbox-relay en verde las cuatro.
Registro: [`docs/_integraciones/2026-10-19-v0.25.0.md`](docs/_integraciones/2026-10-19-v0.25.0.md).

## Integración del 2026-10-19 (decimosexta) — v0.26.0: la bandeja web (tanda 2)

`feat/web-tanda-2-bandeja` @ `7ba9e3e` entra en `main` (`689dcb1`), etiquetada **v0.26.0**. La armó el
integrador desde `origin/main` con 40 rutas de `0586743` (`feat/bandeja-web`), byte a byte. Son la bandeja
más **su cierre de importaciones**, calculado siguiendo los `import` relativos: `barra-modulos` arrastra la
búsqueda global y las notificaciones, `lista-conversaciones` arrastra el distintivo de datos demo y
`crm-api`, y esas piezas arrastran `mock-viajes`, `mock-contactos`, `mock-pipeline`, `mock-catalogo`, y la
lógica de pipeline y de viajes. Con esto, esas tres piezas, que salieron de la tanda 1, quedan
integradas. **Sin la 0c.22**: no entra nada de cotizaciones guardadas, y ningún archivo de la tanda importa
`mock-cotizaciones` ni `cotizaciones-*`.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39338146105, sobre el árbol del merge ·
estáticas en local en verde · web **73** pruebas en 10 archivos.
Registro: [`docs/_integraciones/2026-10-19-v0.26.0.md`](docs/_integraciones/2026-10-19-v0.26.0.md).

## Integración del 2026-10-19 (decimoséptima) — v0.27.0: catálogo web y piezas del cotizador (tanda 3)

`feat/web-tanda-3-catalogo` @ `f008b7c` entra en `main` (`b5327e9`), etiquetada **v0.27.0**. Son 13 rutas de
`0586743`, byte a byte: la página de catálogo y sus componentes, el aviso de configuración del tenant, el
bloque de política de precio, el desglose de cotización por salida, y la lógica de catálogo, cotizador
y política de precio, con sus specs.
**Frontera movida: la página `/cotizador` no entra.** En `0586743` importa `modal-guardar-cotizacion`,
`cotizaciones-api` y `cotizaciones-logica`, que son la 0c.22 y van aparte. `main` se queda con su
cotizador anterior, y el desglose nuevo está listo pero sin usar hasta entonces.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39338773523, sobre el árbol del merge ·
estáticas en local en verde · web **102** pruebas en 13 archivos.
Registro: [`docs/_integraciones/2026-10-19-v0.27.0.md`](docs/_integraciones/2026-10-19-v0.27.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~`/cotizador` con la versión anterior, y piezas sin usar~~ | integrador | **Resuelto en v0.28.0** |

## Integración del 2026-10-19 (decimoctava) — v0.28.0: CRM operativo web y cotizador con guardado (tanda 4)

`feat/web-tanda-4-crm-y-cotizador` @ `c34e779` entra en `main` (`13e08da`), etiquetada **v0.28.0**. Son dos commits,
para revisarlos por separado:

1. **El cotizador con el guardado (0c.22, 0c.24):** `/cotizador`, el modal de guardar, `/cotizaciones` y su ficha,
   `cotizaciones-api`, `cotizaciones-logica`, `cotizaciones-listado-logica` y `mock-cotizaciones`.
2. **La tanda 4:** pipeline, contactos, configuración, viajes, reportes, la maqueta de ingreso bajo interruptor
   (0c.23), la especificación visual con sus capturas y el flujo con Antigravity.

Son 36 archivos de `6d790ff`, byte a byte (34 nuevos y 2 modificados). **R10, comprobado con `git grep`:** en
`apps/web` solo se leen `politica.porcentaje` y `politica.base` dentro de `bloque-politica-precio.tsx` (es
`/configuracion`, del dueño), y de `politica-precio-logica.ts`, que solo ese bloque importa. Ninguna llamada pide
`incluirMargen`, y el texto «CONFIDENCIAL AGENCIA» de `cotizador-logica` solo sale con `incluirNeto`, que ninguna
pantalla pasa.

Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39339456755, sobre el árbol del merge ·
estáticas en local en verde · web **160** pruebas en 20 archivos.

**Lo que queda fuera de `main` de `feat/bandeja-web`: 7 archivos, a propósito.** Los 6 de `traspaso/`, que son el
canal de trabajo con Antigravity y no producto, y su edición de `ESTADO.md`, porque `ESTADO.md` en `main` lo
lleva el integrador. **En `apps/web`, `main` y `6d790ff` no tienen ninguna diferencia.**
Registro: [`docs/_integraciones/2026-10-19-v0.28.0.md`](docs/_integraciones/2026-10-19-v0.28.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| `ficha-detalle-paquete.tsx:244` muestra **«Neto:»** en el catálogo, a cualquiera que lo abra | Antigravity (**0c.27**, con los permisos) | Hoy no hay roles: todo usuario es de la agencia. Se cierra al poner esto y `bloque-politica-precio` detrás del permiso |

## Integración del 2026-10-19 (decimonovena) — `ci/bullmq-real-y-secretos`, sin etiqueta

`ci/bullmq-real-y-secretos` @ `16c03d2` entra en `main` (`897d8df`). Solo toca una prueba, un script de desarrollo y la
bitácora, así que no lleva etiqueta. Compuerta: CI **8/8** sobre el árbol del merge,
https://github.com/Alfavear/CRM/actions/runs/39339999694. En el log consta
`✓ src/modules/inbox/inbox-bullmq.e2e-spec.ts (2 tests) 2440ms` y ningún aviso «SALTADA»: **corrió de verdad**.
Estáticas en local en verde. Registro: [`docs/_integraciones/2026-10-19-bullmq-real.md`](docs/_integraciones/2026-10-19-bullmq-real.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| En el CI, la e2e de BullMQ **se salta, no falla**, si falta `REDIS_URL` (`CORRE = CI && REDIS_URL`). Si alguien quita el Redis del job, el CI seguiría verde | `devops` | Hoy `REDIS_URL` está en el job y la prueba corre. Arreglo: con `CI=true` y sin `REDIS_URL`, fallar |

## Integración del 2026-10-19 (vigésima) — v0.29.0: estados vacío, de carga y de error (0c.25)

`feat/web-0c25-estados` @ `fd3d2df` entra en `main` (`a43de30`), etiquetada **v0.29.0**. Contra `main`, `feat/bandeja-web` @ `2667648`
solo traía la 0c.25 nueva: la 0c.23 y la 0c.24 ya habían entrado en la v0.28.0. Son 12 archivos de `apps/web`: los
esqueletos, `estados-ui-logica` y nueve pantallas. Desde ahora, en `apps/web`, `main` es idéntico a `2667648`.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39341157989, sobre el árbol del merge ·
estáticas en local en verde · web **172** pruebas en 21 archivos.

**`/iniciar-sesion` con el interruptor apagado, comprobado en el build de producción** (sin `NEXT_PUBLIC_AUTH_MAQUETA`).
El HTML prerenderizado (`.next/server/app/iniciar-sesion.html`) solo contiene «Redirigiendo a la bandeja», sin
formulario ni campo de contraseña, y el cliente redirige a `/bandeja`. El chunk JS de la página sí lleva el formulario
y las credenciales de ejemplo (`asesor@viajapro.com` / `demo123`), porque Next no elimina ese código. **Son ficticias**:
la maqueta acepta cualquier contraseña de 6 caracteres o más y no habla con ningún servidor, así que no hay nada que proteger.
Registro: [`docs/_integraciones/2026-10-19-v0.29.0.md`](docs/_integraciones/2026-10-19-v0.29.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| `reportes/page.tsx` muestra **«Costo Neto»** y **«Margen Comercial»** con una etiqueta «Solo Dueño», pero sin control de rol | Antigravity (**0c.27**) | Hoy no hay roles. Va con «Neto:» del catálogo y el bloque de política |
| ~~`err.message` se pinta tal cual~~ | Antigravity (0c.30) | **Cerrado en v0.36.1**: `clasificarError` mira primero el código de dominio |
| La maqueta de ingreso deja su formulario y las credenciales de ejemplo en el chunk de cliente aunque el interruptor esté apagado | Antigravity (con la rebanada 3 del ADR-0011) | Son ficticias y no autentican nada. Se va al sustituir la maqueta por el ingreso real |

## Integración del 2026-10-19 (vigesimoprimera) — v0.30.0: el relay de barrido

`feat/inbox-barrido-pendientes` @ `c00e6c0` entra en `main` (`4c59812`), etiquetada **v0.30.0**. Trae la función
`listar_changes_pendientes` (`SECURITY DEFINER`, propiedad de `viajapro_staging`, `EXECUTE` solo para `viajapro_webhook`,
límite obligatorio de 1 a 1000, sin payload ni tenant) y el barrido del trabajador, que reencola los pendientes.
`auditor-seguridad`: ACEPTAR, sin bloqueantes. Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39341678409,
sobre el árbol del merge, con `inbox-barrido.e2e-spec` (3 pruebas) e `inbox-bullmq.e2e-spec` (2) **ejecutadas** contra
Redis real. Estáticas en local en verde.

**Migración aplicada en Neon desde `main`**, con `prisma migrate deploy` y `current_database() = neondb`. Antes, `migrate status`
avisó de la divergencia que ya conocíamos (`20261019230000_identidad` está en Neon pero no en `main`). `deploy` no se
quejó del orden: aplicó `20261019210000` y terminó con «All migrations have been successfully applied». Comprobado
después en Neon: la función existe, es `SECURITY DEFINER`, su ACL es `{viajapro_staging=X, viajapro_webhook=X}`, la
`checksum` coincide con el sha256 del archivo (`8e67d376…`), y `viajapro_staging` ya no tiene `CREATE` en `public`.
Registro: [`docs/_integraciones/2026-10-19-v0.30.0.md`](docs/_integraciones/2026-10-19-v0.30.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~Más de 500 `changes` abandonados taparían a los nuevos~~ | `datos` | **La base ya tiene el tope (v0.32.0)**: `listar_changes_pendientes` admite `p_max_intentos` (por defecto 10). Falta que el trabajador lo use: ver la cola de `backend` del 2026-10-19 (vigesimosexta) |
| **Al integrar `feat/identity-esquema`**: esta rama y aquella suben las dos el recuento literal de funciones `SECURITY DEFINER` de `aislamiento.spec.ts`. Juntas, el total correcto es **10** | integrador / `datos` | Se resuelve en esa fusión. La aserción lo detecta si queda mal |

## Integración del 2026-10-19 (vigesimosegunda) — v0.30.1: inbox y quoting piden a crm por puertos (R4)

`refactor/puertos-hacia-crm` @ `d828dda` entra en `main` (`304f37b`), etiquetada **v0.30.1**: es un refactor, no cambia la
conducta. Trae tres puertos de `crm`: `asegurarContacto` para `inbox`, y `existeContacto` y `existeOportunidadDelContacto` para
`quoting`. Los tokens viven en `shared/puertos/` y la raíz del trabajador pasa a `worker.module.ts`. Los puertos usan la
transacción y el `set_config` del llamador, el upsert va por `(tenantId, telefono)` bajo RLS, y el trabajador conserva su
guardia de `viajapro_webhook`. `auditor-seguridad`: ACEPTAR. **Con esto se cierran las dos colas de R4.**
`scripts/verificar-fronteras.mjs` detecta ahora el acceso a tablas de otro módulo: ejecutado contra el `main` anterior, marca
`quoting/…/cotizaciones.use-case.ts:99` y `:106`. Sus pruebas dan 6 casos en verde. Compuerta: CI **8/8** sobre la punta
exacta, que iba 0 por detrás: https://github.com/Alfavear/CRM/actions/runs/39342331764. Estáticas en local en verde. Sin
migraciones, así que no hay nada que aplicar en Neon.

## Integración del 2026-10-19 (vigesimotercera) — v0.30.2: la web en móvil (0c.26, 0c.33)

`fix/web-0c26-0c33-movil` @ `afdc7d5` entra en `main` (`f8127b0`), etiquetada **v0.30.2**. Es una corrección visual: arregla los
objetivos táctiles y los desbordes horizontales a 375 px en el catálogo, la ventana de 24 h, el cotizador y el pipeline. Son
cinco archivos de `apps/web` y cuatro capturas de 36 a 41 KB, tomados byte a byte de `ec15d04`. `traspaso/` no entra.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39343734213, sobre el árbol del merge. Estáticas en
local en verde, y la web pasa sus 172 pruebas.

## Integración del 2026-10-19 (vigesimocuarta) — v0.31.0: foráneas con tenant en el modelo antiguo

`fix/db-fk-compuestas-y-asercion-17` @ `9079e95` entra en `main` (`a84e54f`), etiquetada **v0.31.0**. Trae la migración
`20261019220000`, que hace compuestas con `tenant_id` tres foráneas: `paquetes.mayorista_id` (con `SET NULL` solo sobre
`mayorista_id`), `temporadas.paquete_id` y `precios.temporada_id`. La migración termina con un barrido que aborta si queda
alguna simple. Además entra la aserción **54**, que barre el catálogo, y la **17**, reescrita para decidir por columna.
`auditor-seguridad`: ACEPTAR. Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39344193917, sobre el árbol
del merge. Estáticas en local en verde.

**Aplicada en Neon desde `main`** con `migrate deploy`, contra `neondb`. Antes de aplicarla corrí en Neon el mismo barrido de
la migración, solo en lectura. Encontró exactamente las tres foráneas que la migración corrige, y `tablas_sin_aislamiento`
salió vacía, así que no podía abortar a medias. Después de aplicarla, el barrido da **cero** foráneas simples y la `checksum`
coincide con el sha256 del archivo (`03b377ff…`).
Registro: [`docs/_integraciones/2026-10-19-v0.31.0.md`](docs/_integraciones/2026-10-19-v0.31.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| La contraprueba de la 17 hace `CREATE TABLE … REFERENCES tenants`, y eso **bloquea las escrituras en `tenants`** mientras corre (`SHARE ROW EXCLUSIVE`) | `qa` | Va dentro de `BEGIN…ROLLBACK` y dura milisegundos. Contra una base compartida podría frenar un alta de agencia |

## Integración del 2026-10-19 (vigesimoquinta) — v0.31.1: el listado de cotizaciones con los contratos reales (0c.28)

`feat/web-0c28-listado-real` @ `9e504a3` entra en `main` (`aab3ee5`), etiquetada **v0.31.1**. Son cinco archivos de `apps/web`, idénticos a
los de `035e6f9`: el listado de `/cotizaciones` usa ahora `GET /api/v1/cotizaciones` de la v0.25.0, con paginación por cursor,
y no pide nunca `incluirMargen`. Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39345393651. Estáticas en
local en verde, y la web pasa 171 pruebas.

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~Si la API falla, el listado cae al mock sin avisar~~ | Antigravity (0c.34) | **Cerrado en v0.36.1**: con la API real, un fallo es un error en `cotizaciones-api`, `crm-api` e `inbox-api`, con pruebas del 200 malformado |

## Integración del 2026-10-19 (vigesimosexta) — v0.32.0: los huecos del disparador y el tope del barrido

`fix/db-huecos-disparador-y-intentos` @ `c8d88e6` entra en `main` (`e4f45b9`), etiquetada **v0.32.0**. Trae la migración `20261020010000`
y las aserciones 55 a 60, que cierran los cuatro huecos del ADR-0010:

- la baja de una cuenta, con el disparador nuevo `propagar_estado_cuenta`;
- `eliminado_en` tratado como REVOCADO;
- el re-alta: `registrar_enrutamiento` rechaza un estado más laxo que el del canal, y lanza `P0002` si el canal o la cuenta no
  existen bajo el tenant;
- el INSERT.

Además pone el tope de reencolados en la base: `listar_changes_pendientes(…, p_max_intentos DEFAULT 10)` y
`contar_reencolado_barrido`. **Es compatible con el trabajador que ya corre**, que sigue llamando con dos argumentos gracias al
`DEFAULT`. `auditor-seguridad`: ACEPTAR. Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39346331354.

**Aplicada en Neon desde `main`** (`migrate deploy`, `neondb`), y la `checksum` coincide con el archivo (`ca22ed01…`). Neon queda con
**12 funciones `SECURITY DEFINER`**: las 11 de `main` más `sincronizar_acceso_identidad`, que viene de la migración de identidad
todavía sin integrar. Ambos disparadores, el de canal y el de cuenta, están presentes.
Registro: [`docs/_integraciones/2026-10-19-v0.32.0.md`](docs/_integraciones/2026-10-19-v0.32.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~El filtro de reencolados de la base todavía no actúa~~ | `backend` | **Cerrado en v0.33.1**: el trabajador llama a `contar_reencolado_barrido` y pasa `maxReencolados` |
| La baja de una cuenta no da de baja sus canales. **Cuando exista el caso de uso que da de baja una cuenta**, que revoque sus canales en la misma transacción y bajo RLS. Hoy ese caso de uso no existe | `backend` | El directorio ya propaga la baja a las filas WABA (v0.32.0) |

## Integración del 2026-10-20 — v0.33.0: identidad global y roles por agencia (ADR-0011, rebanada 1)

`feat/identity-esquema` @ `c36a839` entra en `main` (`15b79d5`), etiquetada **v0.33.0**. Corrige lo que se devolvió en la vuelta anterior:

- trae `origin/main` fusionado y va 0 commits por detrás;
- las aserciones nuevas son la 61 a la 66;
- la matriz y las aserciones 12 y 13 cuentan **12** funciones `SECURITY DEFINER`;
- `CLAUDE.md` queda igual que en `main`;
- la migración `20261019230000` no cambió.

`auditor-seguridad`: ACEPTAR. Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39347442380, sobre la punta exacta.
Estáticas en el worktree de compuerta (`D:\Projects\CRM-gate`), en verde.

**Neon y `main` coinciden.** La `checksum` de `20261019230000` en Neon (`9071640e…`) es el sha256 del archivo. `migrate status` desde
`main` da 22 migraciones, «Database schema is up to date», sin nada pendiente ni divergente. Se cierra el bloqueo de la aserción 11.
Registro: [`docs/_integraciones/2026-10-20-v0.33.0.md`](docs/_integraciones/2026-10-20-v0.33.0.md).

## Integración del 2026-10-20 — v0.33.1: el contador de reencolados en la base

`fix/inbox-barrido-contador-en-base` @ `b178ee9` entra en `main` (`6b5a3ea`), etiquetada **v0.33.1**. El barrido deja de contar los
reencolados en Redis: ahora llama a `contar_reencolado_barrido` y pasa `maxReencolados` a `listar_changes_pendientes`, las dos
funciones de la v0.32.0. No hay privilegios nuevos ni migraciones. La e2e (`inbox-barrido.e2e-spec`, ahora con 4 pruebas)
demuestra que un change con 11 reencolados deja de listarse. Compuerta: CI **8/8** sobre el árbol del merge, porque la rama
iba 4 por detrás: https://github.com/Alfavear/CRM/actions/runs/39348242898. Estáticas en local en verde.
Registro: [`docs/_integraciones/2026-10-20-v0.33.1.md`](docs/_integraciones/2026-10-20-v0.33.1.md).

## Integración del 2026-10-20 — v0.34.0: el módulo identity con Better Auth (ADR-0011, rebanada 2)

`feat/identity-modulo` @ `2e65648` entra en `main` (`c3bbdf2`), etiquetada **v0.34.0**. Son 57 archivos, un cambio estructural ya anunciado en
el ADR. `auditor-seguridad` lo ACEPTÓ CON UN CAMBIO, que ya está hecho: el límite de intentos sale de `req.ip` con `API_TRUST_PROXY`
(por defecto, ninguno), y una prueba de 6 intentos rotando la cabecera da 429. Compuerta: CI **8/8**, run
https://github.com/Alfavear/CRM/actions/runs/39352438574, sobre la punta, que contiene `main`. Estáticas en local en verde.

- **Variables nuevas.** `DATABASE_IDENTIDAD_URL`, `BETTER_AUTH_SECRET`, `IDENTIDAD_DEV_PASSWORD` y `API_TRUST_PROXY` están vacías en
  `.env.example`, y las dos primeras declaradas en `turbo.json`. El CI genera `BETTER_AUTH_SECRET` con `openssl`, y
  `roles-de-desarrollo.mjs` exporta `DATABASE_IDENTIDAD_URL`.
- **Dependencia nueva:** `better-auth`, justificada en la bitácora del 2026-10-20.
- **Sin `DATABASE_IDENTIDAD_URL`, la API aborta, comprobado.** Arranqué `dist/main.js` sin esa variable: sale con código 1 y el
  mensaje «Falta DATABASE_IDENTIDAD_URL. No hay respaldo a propósito…». No arranca a medias.

**Para el usuario: probar la autenticación en local.** Hoy ningún `.env` local tiene `BETTER_AUTH_SECRET`.

1. Pon en los cuatro `.env` **los mismos valores** de `BETTER_AUTH_SECRET` (`openssl rand -base64 48`), `IDENTIDAD_DEV_PASSWORD`
   y `DATABASE_IDENTIDAD_URL`. La última la escribe `scripts/rotar-roles-y-actualizar-env.ps1`, que ya rota cuatro roles.
2. `pnpm --filter @viajapro/api identidad:sembrar-dev`, que da las credenciales a las identidades de la semilla.
3. `pnpm dev`, y luego `POST /api/v1/auth/sign-in/email` con `Origin: http://localhost:3000`. Deja una cookie de sesión.
   Después, `POST /api/v1/auth/tenant-activo`.
4. Con la cookie, `?incluirMargen=true` da 403 si la persona no tiene el permiso.

Registro: [`docs/_integraciones/2026-10-20-v0.34.0.md`](docs/_integraciones/2026-10-20-v0.34.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~Socket.IO no existe en la API, y sus cuatro `it.todo`~~ | `backend` | **Cerrado en v0.36.0**: el gateway existe y los cuatro `it.todo` son pruebas reales |
| El OTP, cuando entre (rebanada 4), con `storeOTP: 'hashed'` | `backend` | Hoy no hay OTP |

## Integración del 2026-10-20 — v0.34.1: el cotizador de paquetes sin neto ni margen (R10)

`fix/quoting-cotizar-paquete-sin-margen` @ `45b627f` entra en `main` (`c3a3023`), etiquetada **v0.34.1**. **Se devolvió una vez.** En `4dd1428`, al
fusionarla con la v0.34.0, `GET /paquetes/:id` y `POST /paquetes/cotizar` daban neto y margen con `incluirMargen` **sin pedir el permiso**.
Ahora las dos rutas llaman a `autorizarMargen()`: en la e2e de identity, el asesor recibe 403 y la dueña, 200. `pideMargen` de
`cotizaciones.controller` también pasa por `autorizarMargen`. `Precio.neto` es opcional en el contrato, y los tres archivos de
`apps/web` que tocaba ya compilan con él. Compuerta: CI **8/8** sobre la punta, que contiene `main`:
https://github.com/Alfavear/CRM/actions/runs/39353421650. Estáticas en local en verde.
Registro: [`docs/_integraciones/2026-10-20-v0.34.1.md`](docs/_integraciones/2026-10-20-v0.34.1.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| `mayoristaId` sigue saliendo en `/paquetes` | `backend` | No es importe; revela con quién trabaja la agencia, y hoy solo lo ve su propio personal |

## Integración del 2026-10-20 — v0.35.0: invitaciones y código por correo (ADR-0011, rebanada 4)

`feat/identity-invitaciones` @ `7d9bacb` entra en `main` (`ec51ff0`), etiquetada **v0.35.0**. Trae:

- Invitaciones en `verificaciones`, con el token en sha256, de un solo uso y con caducidad.
- Email OTP con `storeOTP: 'hashed'`, 5 minutos y 3 intentos.
- El módulo `notifications`: cola BullMQ con la carga cifrada en AES-GCM y `removeOnFail`, un puerto de correo y Mailpit en local. El
  adaptador de producción queda como TODO.
- Dependencia nueva: `nodemailer`.

`auditor-seguridad` aceptó con un bloqueante, ya corregido: quien tenía `usuarios.administrar` podía invitarse a sí mismo como Dueño. Ahora
los permisos del rol invitado tienen que estar contenidos en los del invitador, o da 403. Además, aceptar una invitación nunca cambia el rol
de un miembro vigente. Las dos cosas tienen su e2e.

**Se devolvió una vez.** `generar-secretos-locales.ps1` no generaba `CORREO_PAYLOAD_KEY` ni `BETTER_AUTH_SECRET`. En `7d9bacb` genera las dos.
**Comprobado:** `CORREO_PAYLOAD_KEY` está vacía en `.env.example`, el CI la genera, y la API **aborta al arrancar** si falta: sale con 1 y el
mensaje «Falta CORREO_PAYLOAD_KEY…».

Compuerta: CI **8/8** sobre la punta, que contiene `main`: https://github.com/Alfavear/CRM/actions/runs/39356530515. Estáticas en local, en verde.
Registro: [`docs/_integraciones/2026-10-20-v0.35.0.md`](docs/_integraciones/2026-10-20-v0.35.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~Antes del adaptador de correo de producción: límite de OTP por correo~~ | `backend` | **Cerrado en v0.37.1**: por IP da 429; por correo (3 cada 15 min) da 200 sin enviar, igual que un correo inexistente. Los contadores van en Redis con TTL y la clave es un HMAC |
| ~~Antes del adaptador de correo de producción: el ADR del proveedor de correo~~ | `arquitecto` | **Cerrado: ADR-0012** (Postmark, con dominio técnico neutro). **En curso:** el adaptador `CorreoPostmark` (`backend`) |

## Integración del 2026-10-20 — v0.36.0: la bandeja en vivo con Socket.IO

`feat/inbox-tiempo-real` @ `00aa61f` entra en `main` (`465bfd5`), etiquetada **v0.36.0**. Trae:

- el gateway, que repite los pasos 3 y 4 del ADR-0011 en el handshake y cada 60 s;
- salas asignadas por el servidor;
- el relay del outbox por Redis pub/sub, que no lleva el texto: la API lee el mensaje bajo RLS;
- los cuatro `it.todo` de la rebanada 2, convertidos en pruebas.

Dependencias nuevas: `socket.io`, y `socket.io-client` solo para pruebas. `auditor-seguridad`: ACEPTAR, sin bloqueantes de aislamiento. Un
evento forjado no lee nada de otra agencia (lo cubre la e2e), y una inyección en Redis solo puede causar denegación de servicio. Compuerta:
CI **8/8** sobre la punta, que contiene `main`: https://github.com/Alfavear/CRM/actions/runs/39358324178. En el log aparece
`inbox-tiempo-real.e2e-spec` con 19 pruebas en verde, ejecutadas contra Redis real. Estáticas en local, en verde.
Registro: [`docs/_integraciones/2026-10-20-v0.36.0.md`](docs/_integraciones/2026-10-20-v0.36.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~ANTES de que la piloto use asesores: un asesor sin `conversaciones.ver_todas` recibía el texto de todas las conversaciones~~ | `dueno-de-producto`, `backend` | **Cerrado en v0.37.0**: la regla de `docs/01-producto/12-visibilidad-de-conversaciones.md` se aplica en la REST y en el socket. **Ya se puede dar de alta al primer asesor** |
| ~~Si la revalidación falla por infraestructura, el socket sigue abierto~~ | `backend` | **Cerrado en v0.37.1**: tres fallos seguidos lo cierran (`SOCKET_REVALIDACION_MAX_FALLOS`), y una sesión inválida, al momento |
| El primer barrido tras desplegar emitirá los **eventos viejos** del outbox | `backend` | No hay nada desplegado. Antes del primer despliegue: marcar los eventos viejos como emitidos, o filtrar por antigüedad |

## Integración del 2026-10-20 — v0.36.1: la web no cae al mock ni pinta err.message (0c.34, 0c.30, 0c.31)

`feat/web-0c30-0c31-0c34` @ `bebc87c` entra en `main` (`98b267d`), etiquetada **v0.36.1**. Son 17 archivos de `apps/web`, idénticos a `0bededa`:

- **0c.34**: con la API real encendida, un fallo es un error, nunca datos simulados. Afecta a `cotizaciones-api`, `crm-api` e `inbox-api`, y
  hay pruebas del 200 malformado. **Se cierra el bloqueante del primer despliegue.**
- **0c.30**: ya no se pinta `err.message` tal cual.
- **0c.31**: pruebas accesibles de los componentes de estado.

**Los tres archivos que tocó el backend en v0.34.1:** `ficha-detalle-paquete.tsx` y `catalogo-logica.spec.ts` quedan igual que en `main`.
`cotizador-logica.ts` solo cambia por la 0c.30 (`formatearErrorAmigable` en lugar de `error.message`), y las líneas de la v0.34.1 siguen ahí.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39359410509. Estáticas en local, en verde. Web, **218** pruebas.

## Integración del 2026-10-20 — v0.36.2: teclado y foco en los modales (0c.32)

`feat/web-0c32-foco` @ `aedec34` entra en `main` (`f433eb5`), etiquetada **v0.36.2**. Son 8 archivos de `apps/web`, idénticos a los de `44e8a07`.
El hook `use-foco-modal` atrapa el foco, cierra con Escape y devuelve el foco al salir en los cuatro modales. Las pruebas usan teclas reales.
Compuerta: CI **8/8**, https://github.com/Alfavear/CRM/actions/runs/39361825426. Estáticas en local, en verde. Web: **227** pruebas.
Registro: [`docs/_integraciones/2026-10-20-v0.36.2.md`](docs/_integraciones/2026-10-20-v0.36.2.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| `alCerrar` está entre las dependencias del hook: si el padre se vuelve a renderizar, podría robar el foco. Sin reproducir | Antigravity | Menor. Aún no se ha visto pasar |

## Integración del 2026-10-20 — v0.37.0: visibilidad de conversaciones por asignación

`feat/inbox-visibilidad` @ `c76b1d8` entra en `main` (`6032ae3`), etiquetada **v0.37.0**. Trae:

- **La decisión del `dueno-de-producto`**, `docs/01-producto/12-visibilidad-de-conversaciones.md`, con su glosario. Vino dentro de esta rama.
  Su fila en §2 de `ESTADO.md` se fusionó sin conflicto.
- **La regla:** sin `ver_todas`, cada asesor ve las conversaciones que tiene asignadas y las de la cola común. Hay una e2e por cada criterio,
  del CA1 al CA17.
- **Rutas REST nuevas:** `api/v1/conversaciones` y `POST /identidad/miembros/:id/baja`.
- **El socket** emite a `usuario:<id>` y añade `CONVERSACION_RETIRADA`. Es un cambio de contrato.

`auditor-seguridad` aceptó con un bloqueante, ya corregido: con `usuarios.administrar` se podía dar de baja a la única dueña. Ahora devuelve
403 si faltan permisos (usa `permisoQueFalta`, compartida con las invitaciones) y 409 `NO_PUEDE_DEJAR_SIN_DUENO`. Las dos tienen su e2e.

Compuerta: CI **8/8** sobre el árbol fusionado, porque la rama iba 3 commits por detrás:
https://github.com/Alfavear/CRM/actions/runs/39362743786. Corrieron `inbox-visibilidad.e2e-spec` (31 pruebas), la de su caso de uso (8) y la
de la regla (12). Estáticas en local, en verde. Registro: [`docs/_integraciones/2026-10-20-v0.37.0.md`](docs/_integraciones/2026-10-20-v0.37.0.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| **La bandeja web tiene que tratar `CONVERSACION_RETIRADA`** y pasarse a la REST nueva `api/v1/conversaciones` | Antigravity | Hoy la web usa mocks y el socket anterior. Sin esto, al asesor no se le quita de la pantalla la conversación reasignada |

## Integración del 2026-10-20 — v0.37.1: endurecimiento de identity

`fix/identity-endurecimiento` @ `b8ce6c8` entra en `main` (`e455d93`), etiquetada **v0.37.1**. Cierra las dos colas del auditor:

1. **El socket.** «No pude comprobar» cuenta como fallo, y a los tres seguidos se cierra (`SOCKET_REVALIDACION_MAX_FALLOS`). Una sesión
   inválida lo cierra al momento.
2. **El límite de OTP.** Por IP (`req.ip`) devuelve 429. Por correo devuelve 200 sin enviar nada, para no revelar si el correo existe.

No hay migraciones. Compuerta: CI **8/8** sobre la punta, que contiene `main`: https://github.com/Alfavear/CRM/actions/runs/39364001732.
Estáticas en local, en verde. Registro: [`docs/_integraciones/2026-10-20-v0.37.1.md`](docs/_integraciones/2026-10-20-v0.37.1.md).

| Cola | Dueño | Por qué no bloquea |
|---|---|---|
| ~~El adaptador Redis de los contadores de OTP solo se probó con un doble~~ | `backend` | **Cerrado** (`ab5b3cf`): `limite-otp-redis.e2e-spec` corre contra el Redis del CI, 3/3 |
| ~~`SOCKET_REVALIDACION_MAX_FALLOS` sin línea en `.env.example`~~ | `backend` | **Cerrado** (`ab5b3cf`) |

## Integración del 2026-10-20 — `test/identity-limite-otp-redis-real`, sin etiqueta

`test/identity-limite-otp-redis-real` @ `f601168` entra en `main` (`ab5b3cf`). Solo trae pruebas y la plantilla, así que no lleva etiqueta. La e2e
`limite-otp-redis.e2e-spec` corre contra el Redis real del CI y pasa 3 de 3, sin «SALTADA». Prueba el 429 por IP, el corte silencioso por
correo y que la clave sea un HMAC con TTL. Además, `SOCKET_REVALIDACION_MAX_FALLOS=3` ya está en `.env.example`. Compuerta: CI **8/8**,
https://github.com/Alfavear/CRM/actions/runs/39367641187, sobre la punta, que contiene `main`. Se cierran las dos colas de la v0.37.1.

## Integración del 2026-10-20 — ADR-0012, proveedor de correo, sin etiqueta

`docs/adr-0012-proveedor-de-correo` @ `9b8eeb5` entra en `main` (`785a189`). Trae el ADR-0012 (**Postmark**), su fila en `docs/README.md` y la
bitácora. Es solo documentación y no toca `CLAUDE.md`: no lleva etiqueta. `format:check` está limpio.

- **`auditor-seguridad`:** ACEPTAR CON CAMBIOS, ya incorporados en el ADR. La invitación caduca a las 72 h. Postmark con MFA y retención
  mínima. `devops` rota el token. En los registros, solo el `ErrorCode`. El futuro webhook, con autenticación básica.
- **El propietario lo aceptó** («Acepto Postmark», «Un dominio técnico neutro»), según consta en la bitácora del 2026-10-20.
- **En curso:** el adaptador `CorreoPostmark` (`backend`).

**Para el usuario, los pasos del ADR-0012, en orden:**

1. Comprar el **dominio técnico neutro**.
2. Crear la cuenta de **Postmark con MFA**.
3. Publicar en el DNS los registros **DKIM**, **Return-Path** y **DMARC**.
4. Pasar el token de Postmark a `devops`, por el gestor de secretos y nunca por el chat.
5. Consultar al **abogado** por la SIC: el correo transaccional y el tratamiento de datos (Ley 1581).

