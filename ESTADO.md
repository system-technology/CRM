# ESTADO — El hilo vivo de ViajaPro

> **Este es el primer archivo que lee cualquier persona o agente al abrir el proyecto.**
> Responde tres preguntas: dónde estamos, qué sigue, qué está bloqueado.
> Se actualiza al cerrar **cada** sesión de trabajo. Si está desactualizado, el hilo se rompió.

| Campo | Valor |
|---|---|
| Última actualización | 2026-10-10 (integración: contratos de crm, agentes de producto y el webhook del inbox) |
| Actualizado por | Claude Opus 5 |
| Fase | **Rebanada vertical de paquetes, en construcción** |
| Avance de la fase | Cotizador de punta a punta. Esquema del inbox, 30/30 contra Neon. **Apretón de manos del webhook vivo y verificado contra la API corriendo.** Bandeja web en construcción |
| Próximo hito | **El trabajador que resuelve de qué agencia es cada mensaje.** El `POST` ya guarda cifrado y verificado contra Neon; falta tomar los `change` pendientes |

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
| Repositorio | [github.com/Alfavear/CRM](https://github.com/Alfavear/CRM) · **privado** · `main` en **v0.13.0** (`9b3a872`, cuatro commits después del tag: utillaje, sin versión) |
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
| Norte de producto | El brochure fija la dirección: qué módulos, qué flujo, qué tono | `docs/00-vision/05-norte-del-producto.md` |

### Lo comercial NO está decidido

`images/Brochure.jpeg` es **inspiración y dirección de producto, no un compromiso comercial.**
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
| 1 | **Iniciar verificación de Meta Business y solicitud de Tech Provider** | Usuario | **Camino crítico, sin empezar** |
| 2 | **Recibir el tarifario real del mayorista** de la agencia piloto | Usuario | La agencia ya está tramitando la información (2026-10-07). Hasta que llegue, el catálogo sigue modelado con datos verosímiles |
| 2b | **Bajar el tarifario de Meta para Colombia en COP** del CSV oficial | Usuario | Cinco minutos con un navegador. Sin esa cifra el plan de entrada se fija a ciegas |
| 3 | Reparar la conexión del MCP `postgres` o retirarlo de `.mcp.json` | `devops` | Falla con `CONNECTION_CLOSED` |
| 4a | Inbox — esquema, roles, funciones y aserciones | `datos` | **Hecho.** 30/30 contra Neon, dos auditorías de seguridad, seis mutaciones verificadas en rojo |
| 4a.1 | **Ver en verde los jobs `aislamiento-tenants` y `test` en CI** antes de integrar | `devops` | **Condición del auditor.** Nunca han corrido: ejecutarlos una vez es la única forma honesta de cerrar ese hallazgo |
| 4b | Inbox — API: tres orígenes de conexión, guardia de identidad, puerto a `crm`, relay por `change` | `backend` | **En curso** en `feat/inbox-webhook`. Hechos: guardia de identidad del rol, firma HMAC, apretón de manos (`GET` vivo y verificado), desglose del sobre. Falta el `POST` con persistencia durable |
| 4c | Las 3 verificaciones que **no** son de base de datos: arranque del proceso, alta de extremo a extremo, ensayo de rotación de la pimienta | `backend`, `qa`, `devops` | **En curso.** La de arranque está hecha: `guardia-de-rol.ts` comprueba identidad, `rolsuper` y `rolbypassrls`, y la API registra al arrancar «Conectado como 'viajapro_app', verificado». Faltan las otras dos |
| 4d | Alinear `05-seguridad/02-proteccion-de-datos.md` con el ADR-0008 | `documentador` | La redacción de consentimiento lo contradice. Faltan pimienta y clave de plataforma en el inventario §5 |
| 4e | **ADR que enmiende el ADR-0008 en cinco puntos** | `arquitecto` | Un ADR es inmutable y hoy describe un sistema que no existe: tokens en `cuentas_whatsapp`, `cuenta_id` en el directorio, una **séptima** función, `crear_particion_historial` fuera del inventario, y el hueco de `purgar_directorio`. **Lo más fácil de olvidar y lo más caro en seis meses** |
| 4f | Reconciliación directorio ↔ verdad | `backend` | Una agencia marcada `REVOCADO` en `canales` se sigue resolviendo como `ACTIVO`: se persistirían mensajes de una agencia sin contrato |
| 4g | `purgar_directorio`, o decidir que es manual | `arquitecto`, `datos` | Hoy ninguna fila del directorio se puede borrar por ningún camino de código. **No bloquea un esquema vacío; bloquea el primer tenant en producción** |
| 4h | Trabajo anual de creación de particiones del historial | `devops` | Si falta la del año siguiente, **ninguna agencia puede conectar su canal**. Mejor: un *event trigger* que lo haga imposible de olvidar |
| 4i | Aserción de concurrencia determinista y orden de las aserciones | `qa` | La de la carrera falla hacia el verde; y 22/23 reparan privilegios, así que enmascaran a cualquier aserción declarada después |
| 5 | Bandeja de conversaciones en la web | Antigravity, en `feat/bandeja-web` | **En curso.** Lista y pantalla de conversación construidas, con idempotencia R5 verificada en navegador. La entrega de tiempo real fue rechazada: su emisor genera un UUID inválido y ningún evento llega a la pantalla |
| 6 | Guardar cotizaciones con versiones inmutables | `backend` | Hoy el cálculo no persiste |
| 7 | Pruebas de integración de la API | `qa` | Solo se probó a mano. **La verificación del cotizador fue manual: no hay prueba automática que la repita** |
| 8 | CI en GitHub Actions corriendo de verdad | `devops` | Escrito, nunca ejecutado |
| 9 | Decidir nombre comercial, modelo de cobro y precios | Usuario | Antes de vender |
| 10 | Resolver la protección de `main` en GitHub | Usuario | Plan gratuito no la permite en repos privados |
| 11 | **Rotar la contraseña de Neon y la clave de API de Stitch** | Usuario | **Sigue pendiente.** `ac7fb99` rotó los tres roles de PostgreSQL, que es otra cosa. Ambas se pegaron en el chat; un secreto expuesto no se borra, se rota |
| 11b | **`META_APP_SECRET` y `WEBHOOK_PAYLOAD_KEY_VERSION` no están en `.env`** | Usuario | Sin el primero el `POST` rechaza **todo** con 403, y sin el segundo lanza al cifrar. El `POST` se verificó con un secreto temporal en memoria. El secreto va al `.env`, nunca al chat |
| 11c | Los metadatos de decorador no siempre llegan con el transpilador de desarrollo | `backend` | Nest construyó un controlador **con cero dependencias y sin quejarse**; el fallo salió como un `undefined` en la primera petición real. El módulo `inbox` usa ya `@Inject` explícito; **falta revisar `quoting` y `shared`, donde el mismo silencio es posible** |
| 11d | El aviso «Acceso sin contexto de tenant» se emite **una vez por mensaje** | `backend` | Es deliberadamente incómodo para que llame la atención en una revisión, pero en el webhook es legítimo y a volumen real inunda el registro |
| 12 | Autenticación: el `tenant_id` debe salir del token de sesión | `backend` | Hoy la web lo envía por cabecera. Solo funciona con `APP_ENV=local`, pero es deuda que bloquea desplegar |
| 13 | **La carrera de `turbo` entre `build` y `typecheck` de la web** | `devops` | `next build` reescribe `.next/types` mientras `tsc` lo lee. Por separado pasan; en paralelo da un rojo falso. **Morderá en CI**, que es justo donde corren en paralelo |
| 14 | El aviso de `any` no es una compuerta | `devops` | `no-explicit-any` está en `warn` y ningún script lleva `--max-warnings 0`: hoy hay cero `any`, pero el primero entraría sin que lint falle |

## 4. Bloqueos y riesgos activos

| Bloqueo | Impacto | Dueño | Mitigación |
|---|---|---|---|
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

- [`2026-10-10-el-dia-que-medimos-todo.md`](docs/_bitacora/2026-10-10-el-dia-que-medimos-todo.md) ← **empieza por aquí**
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
| **La aserción 17 comprueba el NOMBRE de la columna, no lo que guarda.** Dice «ninguna tabla global tiene columna `tenant_id`», pero una tabla global que guarde datos de agencia bajo otro nombre la pasa sin que nadie se entere — y eso ya existe: `enrutamiento_canales` usa `tenant_resuelto_id` y `enrutamiento_historial_2026` usa `tenant_anterior`, `tenant_nuevo` y `actor_tenant_id`. Debería comprobar **columnas `uuid` que referencien `tenants`**, no un literal. Y `excepciones_rls` debería exigir motivo revisado, no solo existencia | `qa` | **Hoy no es fuga:** se verificó contra la base que las seis tablas sin RLS con columna de tenant están todas declaradas en `excepciones_rls`. La aserción promete más de lo que comprueba; el diseño que vigila es correcto |
| `aislamiento.spec.ts` limpia sus fixtures solo en `afterAll`. Una ejecución interrumpida envenena todas las siguientes, que es justo lo que pasó hoy. La limpieza tiene que correr también en `beforeAll` | `qa` | Es higiene del suite, no una fuga |
| `decodificarClave` acepta hexadecimal o base64. La regla es determinista (64 caracteres `[0-9a-f]` → hex; lo demás, base64) y el largo se verifica después, así que se aceptó. Pendiente: que el generador de secretos y el lector acuerden **una** codificación y la rama desaparezca | `devops` | No hay sustitución silenciosa: lo que no mide 32 bytes lanza al arrancar |
| Auditar la cadena de inyección de `quoting` y `shared`: el mismo silencio de Nest que construyó el controlador del inbox con cero dependencias es posible ahí | `backend` | Hoy no está roto; el inbox ya lleva `@Inject` explícito |
| `dueno-de-producto` tiene `Bash` entre sus herramientas y `facilitador` no declara lista, así que las hereda todas. El hook `guard-rama` les impide escribir en `main` | `arquitecto` | Defensa en profundidad ya presente |
