# 2026-11-04 — Auditoría de veracidad: ¿hay algo usable por una agencia?

**Participantes:** `documentador` (auditoría de solo lectura sobre `origin/main`), a petición del propietario.
**Duración / alcance:** lectura de código, pruebas e historial del CI en `origin/main` (`98c2a08`, 2026-11-05 UTC).
No se ejecutó base de datos, Docker ni servicios. La pregunta: «¿ya tenemos algo totalmente funcional en lo que
valga la pena invertir (hosting)? Si no, seguimos locales».

## Veredicto

**No hay hoy un flujo completo usable por una agencia.** El backend de cada pieza existe y tiene pruebas e2e
en CI contra Postgres y Redis reales. Pero (1) nunca se ha probado la web contra esa API en ninguna corrida
automática, (2) el ciclo WhatsApp entra-y-sale no se ha ejercitado contra Meta real, solo contra una Graph API
falsa y, en recepción, con el botón «Probar» de Meta, y (3) con la configuración por defecto de `.env.example`
la web arranca en maqueta. **Seguimos locales.** Hosting solo tiene sentido cuando se haya corrido la jornada
una vez en local (ver «Qué falta»).

## Cómo leer las categorías

- **A** — web → API real → base, con prueba e2e en CI. **Ninguna capacidad llega a A:** el CI no tiene ninguna
  prueba de navegador ni de la web contra la API (no hay Playwright ni Cypress en el repositorio). Los jobs que
  ejecutan e2e son `test` (121 archivos, 965 pruebas en la última corrida; Postgres 16 y Redis 7 como servicios)
  y `aislamiento-tenants`; ambos prueban la API, no la web.
- **B** — código completo; backend probado en CI (se indica «API-CI») pero sin prueba conjunta con la web,
  o sin prueba contra Meta real. Es el techo actual.
- **C** — maqueta: la pantalla muestra `mock-*.ts`, `localStorage` o datos inventados.
- **D** — no existe.

Corrida de CI citada: `CI` run 41942116518 (merge del PR #193), 9 jobs en verde (`secretos`, `typecheck`, `lint`,
`build`, `test`, `aislamiento-tenants`, `fronteras-entre-modulos`, `imagenes-de-despliegue`, `politica-de-rama`;
`convencion-de-commits` se omite fuera de PR). 29 de las últimas 30 corridas de CI en `main` en verde, 1 en curso.
En esa corrida `arranque-seguro.e2e-spec.ts` aparece «22 skipped» en el paso `pnpm test` y se ejecuta aparte con
`VIAJAPRO_EXIGIR_ARRANQUE_SEGURO=1`.

## Matriz por capacidad

| Capacidad | Clase | Evidencia | Lo que falta o no está probado |
|---|---|---|---|
| Ingreso y sesión (correo+contraseña, OTP) | **B** API-CI | `identity.e2e-spec.ts` (29), `limite-otp-redis.e2e-spec.ts`; web `lib/auth-api.ts`, `/ingresar` | La web usa sesión **real solo si `NEXT_PUBLIC_USE_REAL_AUTH=true`** (`usaAuthReal`, `estaAuthHabilitada`). Sin ella `/ingresar` redirige a `/bandeja` y la sesión es mock (`MOCK_SESION_*`). `.env.example` no menciona esa variable |
| Roles y permisos RBAC | **B parcial** | Migración `20261104130000_permisos_de_mutacion_rbac` (T-089, en `main`); `@RequierePermiso` solo en `catalogo.administrar` (20 usos) y `usuarios.administrar` (2). Web: `permisos.ts` | **Las mutaciones de bandeja, CRM y cotizaciones no exigen permiso en la API:** el PR #191 (controladores) sigue abierto. T-089 figura `done` en `tasks.yaml` pero solo cubre la migración. T-118 (acciones web según permisos) en curso, no integrado |
| Visibilidad de conversaciones por asesor | **B** API-CI | `inbox-visibilidad.e2e-spec.ts` (31) | Sin prueba desde la web |
| Aislamiento entre agencias (RLS) | **A en su capa** (API+base) | Job `aislamiento-tenants` en verde; 79+ aserciones; `arranque-seguro` | Es el único aspecto con compuerta propia. No hay prueba web |
| Catálogo: listar, ficha | **B** API-CI | `catalogo.e2e-spec.ts` (28), `catalogo-listado.e2e-spec.ts`; web `lib/catalogo-api.ts` | `/catalogo` arranca con `MOCK_PAQUETES_CATALOGO` en varios filtros y fichas (`app/catalogo/page.tsx` líneas 177, 192, 471, 502); real si `estaUsandoCatalogoReal()` y no es demo |
| Catálogo: crear, editar, desactivar, tarifas, vigencias | **B** API-CI | `catalogo-gestion.e2e-spec.ts`, `vigencias-y-tarifas.e2e-spec.ts`, `historial-de-precios.e2e-spec.ts`, `catalogo-ajustes.e2e-spec.ts` | Sin prueba web↔API |
| Catálogo: importar (previsualizar, confirmar, plantillas CSV/Excel) | **B** API-CI | `importaciones.e2e-spec.ts`, `importaciones-confirmar.e2e-spec.ts` | Plantilla `.xlsx` en navegador bloqueada (T-052). API pública por claves, IA de ingesta: **D** (T-053 a T-058) |
| Cotizador: calcular | **B** API-CI | `cotizador-punta-a-punta.e2e-spec.ts` (4), `paquetes-sin-margen.e2e-spec.ts` | `/cotizador` mantiene una rama mock completa (45 referencias a `mock`); real si el modo real está activo |
| Cotizador: guardar, versiones, estados | **B** API-CI | `cotizaciones.e2e-spec.ts` (19); web `cotizaciones-api.ts` | Igual |
| Margen oculto al cliente | **B** API-CI | `enviar-cotizacion.e2e-spec.ts` L231: el texto enviado no contiene `neto` ni `margen`; `paquetes-sin-margen.e2e-spec.ts` | Solo se prueba el texto saliente y los paquetes; no la ficha entera de la web |
| Bandeja: listar, abrir, notas, estado, leída | **B** API-CI | `inbox-visibilidad.e2e-spec.ts`, `conversaciones.controller.ts`; `lib/inbox-api.ts` | Real por defecto, pero `.env.example` trae `NEXT_PUBLIC_USE_REAL_INBOX=false` y `NEXT_PUBLIC_USE_REAL_CRM=false`: quien copia el ejemplo arranca en maqueta. La bandeja `[id]` usa plantillas mock (`mock-plantillas.ts`, línea 313) |
| Bandeja: asignar y reasignar | **B** API-CI | `PUT /conversaciones/:id/asignacion`; `modal-reasignar.tsx` importa un mock | El modal de reasignación usa miembros mock; sin lista real de miembros (ver equipo) |
| RECEPCIÓN de WhatsApp → conversación | **B** API-CI + una prueba manual | `inbox-webhook.e2e-spec.ts` (9); `inbox-bullmq.e2e-spec.ts` (POST firmado → Redis real → consumidor → mensajes; pasa en CI); `inbox-relay`, `inbox-outbox-relay`, `inbox-barrido`. Manual: 2026-10-26, botón «Probar» de Meta por túnel, guardado cifrado | Nunca se ha visto en una bandeja un mensaje enviado desde un celular. Según `CONTEXTO.md`, con la app de Meta sin publicar solo llegan webhooks de prueba del panel. Sin Redis y trabajador en marcha, el mensaje se guarda y no se procesa (ADR-0010). **Sin despliegue** |
| ENVÍO de texto a Meta | **B** sin Meta real | `EnvioWhatsappGraph` (`envio-whatsapp.graph.ts`), cola de envíos BullMQ; pruebas con Graph API falsa; `crear-envio-whatsapp.ts` | Nunca probado contra `graph.facebook.com`. Requiere `META_SYSTEM_USER_TOKEN` (el temporal dura 24 h), `META_PHONE_NUMBER_ID_PRUEBA` y `META_TENANT_ID_PRUEBA`; sin ellos cada mensaje queda `FALLIDO` |
| Enviar una cotización por WhatsApp | **B** API-CI, sin Meta | `enviar-cotizacion.e2e-spec.ts` (6: idempotencia, ventana 24 h, otro contacto 422, otra agencia 404); `modal-enviar-cotizacion.tsx` (desde la conversación) | Fuera de la ventana de 24 h no hay plantilla de reapertura (T-078 bloqueada, **D**). El modal de `/cotizaciones` usa contactos mock y un teléfono de relleno `+573001234567` (`app/cotizaciones/page.tsx` 88 y 675) |
| Contactos: listar, crear, editar, ficha 360 | **B** API-CI | `crm.e2e-spec.ts` (9), `contactos-y-seguimientos.e2e-spec.ts`; `crm-api.ts` | `/contactos` inicia con `obtenerMockPaginaContactos()` en el estado; si la API falla, el error se muestra pero la lista mock queda a la vista |
| Oportunidades y pipeline (tablero, mover, motivo de pérdida) | **B** API-CI | `GET /crm/tablero`, `PATCH /crm/oportunidades/:id/etapa`; `crm.e2e-spec.ts` | `/pipeline` cae al mock si no hay modo real. **Etapas configurables (T-025): C.** La web llama a `GET/PUT /api/v1/crm/etapas`, que **no existe en la API**; ante 404 finge que guardó (`actualizarEtapasPipelineApi`) |
| Seguimientos con fecha e inicio del asesor | **B** API-CI | `GET /crm/seguimientos`, `.../pendientes-del-dia`, `POST`, `.../completar`; `contactos-y-seguimientos.e2e-spec.ts`; `/` y `/seguimientos` llaman a la API | Sin prueba web↔API. No hay recordatorio por WhatsApp ni correo: el asesor tiene que abrir la pantalla |
| Consentimiento del contacto | **B** API-CI | `POST /crm/contactos/:id/consentimientos` y `/revocar`; T-096, T-116; migración `..._consentimiento_texto_mostrado` | Sin prueba web↔API |
| Privacidad, derechos del titular | **C/D** | Páginas `/privacidad`, `/terminos`, `/cookies` (T-108). Exportar y suprimir datos de un contacto (T-097): **D**; aviso de privacidad aprobado (T-093), RNBD (T-098): bloqueadas | `mensajes.texto` está en texto plano en la base (`schema.prisma`; el cifrado por columna espera un ADR, T-090). PR #29 (ADR-0015) sigue abierto |
| Tiempo real (Socket.IO) | **B** API-CI | `inbox-tiempo-real.e2e-spec.ts` (19), `inbox-tiempo-real-redis.e2e-spec.ts` (5); web `inbox-socket.ts` | Sin prueba con un navegador. Las notificaciones web (T-110) guardan preferencias en `localStorage` |
| Correo (OTP, invitaciones) | **B** API-CI, sin proveedor real | `invitaciones.e2e-spec.ts` (19), `correo-postmark.spec.ts`, `notifications-bullmq.e2e-spec.ts` | Adaptador Postmark nunca probado con cuenta real. En local, `MAIL_PROVIDER=mailpit` exige Mailpit (no instalado en la máquina del propietario según `CONTEXTO.md`) |
| Equipo (listar miembros, invitar, dar de baja) | **B/C** | `POST /identidad/invitaciones` y `POST /identidad/miembros/:id/baja` existen y tienen e2e | La lista de miembros pide `GET /api/v1/identidad/usuarios`, **que no existe**: la web cae a `localStorage` o a `MOCK_MIEMBROS_EQUIPO` (`equipo-api.ts`) |
| Campos personalizados, respuestas rápidas, filtros guardados, onboarding | **C** | `localStorage` (`campos-personalizados-logica.ts`, `respuestas-rapidas-logica.ts`, `onboarding-logica.ts`) | No hay API ni tabla: lo que un asesor guarda no lo ve otro y se pierde al limpiar el navegador |
| Configuración (SLA, datos de la agencia, estado de WhatsApp, plantillas oficiales) | **C** | `app/configuracion/page.tsx` inicia con `MOCK_CONFIGURACION_*`; `mock-plantillas.ts` | No existe endpoint de estado del canal ni de plantillas. El único ajuste con API real es «promoción vencida» |
| Reportes | **C parcial** | `reportes-logica.ts` calcula desde el tablero real, pero **fabrica** `costoNetoTotal` = 80 % y `margenTotal` = 20 % de las ventas (`calcularReporteDesdePipeline`) | El margen mostrado no es dato: es una constante |
| Archivos de viaje (`/viajes`) | **C** | `app/viajes/page.tsx` usa `MOCK_ARCHIVOS_VIAJE` | Sin API. Fuera del alcance de la Fase 1 |
| Inicio, ensayo de jornada | **B** | `app/page.tsx` y `app/ensayo/page.tsx` consultan `/conversaciones/contadores`, `/cotizaciones`, `/crm/seguimientos`; en real descartan los mocks | Es un contador de la jornada, no la prueba de la jornada |
| Pagos, automatizaciones, IA, analítica | **D** | Sin módulos en `apps/api/src/modules/` (solo `crm`, `identity`, `inbox`, `notifications`, `quoting`) | — |
| Despliegue (Render) | **D verificable** | `render.yaml` y `runbook-redis-staging.md` existen; `Deploy staging` termina en verde con el aviso «Faltan los secretos del Environment 'staging'» (run 41942440071) | No hay URL desplegada en el repositorio. T-079 está `done` por el runbook, no porque haya un servicio vivo |

## Pantallas de `apps/web` y su origen de datos por defecto

El modo se decide en `lib/modo-demo.ts` (demo solo con `?demo=1`, `localStorage` o `NEXT_PUBLIC_FORCE_DEMO`/`USE_MOCK_INBOX`/`USE_REAL_CRM=false`)
y en `estaUsandoApiReal()`. Por defecto en código: real. **Pero** `.env.example` fija `NEXT_PUBLIC_USE_REAL_CRM=false` y
`NEXT_PUBLIC_USE_REAL_INBOX=false`, lo que activa la maqueta.

| Pantalla | Por defecto | Nota |
|---|---|---|
| `/ingresar`, `/aceptar-invitacion` | API real solo con `NEXT_PUBLIC_USE_REAL_AUTH=true`; si no, redirige a `/bandeja` con sesión mock | |
| `/` (inicio), `/seguimientos`, `/cotizaciones/[id]` | API real | |
| `/bandeja`, `/bandeja/[id]` | API real | Plantillas de WhatsApp: mock |
| `/contactos`, `/contactos/[id]` | API real | `/contactos` parte con lista mock hasta que responde |
| `/pipeline` | API real | Etapas configurables: local |
| `/catalogo`, `/cotizador`, `/cotizaciones` | API real si `estaUsandoCatalogoReal()` | Conservan ramas mock; `/cotizaciones` usa contactos mock para los nombres |
| `/reportes` | Calculado del tablero | Margen constante, ver matriz |
| `/ensayo` | API real | |
| `/configuracion` | **Mock** (salvo promo vencida) | |
| `/viajes` | **Mock** | |
| `/privacidad`, `/terminos`, `/cookies`, `/politica-cookies`, `/bienvenida` | Estáticas | |

## Cómo se corre en local hoy

Fuentes: `package.json`, `apps/api/package.json`, `.env.example`, `infra/docker/docker-compose.yml`,
`docs/_contexto/CONTEXTO.md` §4–6. **El README dice «Todavía no hay código de aplicación»** (miente, ver abajo).

1. Node ≥ 22.20 y pnpm 9.12; `pnpm install`.
2. Postgres: `pnpm infra:up` (Docker: Postgres, Redis, MinIO, Mailpit, Jaeger) **o** Neon. En la máquina del propietario no hay Docker ni Redis (`CONTEXTO.md`, 2026-10-27); el Postgres 18 local no tiene credenciales conocidas; el desarrollo apuntaba a Neon.
3. `.env` desde `.env.example` con: `DATABASE_URL`/`DIRECT_URL`, `DATABASE_APP_URL`, `DATABASE_ALTAS_URL`, `DATABASE_WEBHOOK_URL`, `DATABASE_IDENTIDAD_URL` (vacía en el ejemplo), `BETTER_AUTH_SECRET`, `CORREO_PAYLOAD_KEY`, `WEBHOOK_PAYLOAD_KEY`, `WHATSAPP_DIRECTORY_PEPPER`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `IDENTIDAD_DEV_PASSWORD`. Para que la web hable con la API real: `NEXT_PUBLIC_USE_REAL_CRM=true`, `NEXT_PUBLIC_USE_REAL_INBOX=true`, `NEXT_PUBLIC_USE_REAL_AUTH=true` (no está en el ejemplo).
4. `pnpm db:migrate:deploy`, roles de aplicación (`pnpm db:setup` / `packages/database/scripts/roles-de-desarrollo.mjs`), `pnpm db:seed`, `pnpm --filter @viajapro/api identidad:sembrar-dev` (usuarios con `IDENTIDAD_DEV_PASSWORD`).
5. `pnpm dev` (turbo): API en :3333 y web en :3000. **No arranca el trabajador.** `apps/worker` solo tiene un README vacío; el trabajador real es `apps/api/src/worker.ts`.
6. Para que un mensaje de WhatsApp **entre y salga** falta, exactamente:
   - Redis accesible en `REDIS_URL` (sin `COLA_CHANGES=inerte`, `BUS_DE_EVENTOS` ni `LIMITADOR_OTP` en `memoria`). Hoy no hay Redis en la máquina; opciones: Docker (`pnpm infra:up`), WSL o Memurai. El PR #200 propone un despliegue mínimo sin Redis (ADR-0019, no integrado).
   - Un segundo proceso: `pnpm --filter @viajapro/api worker` (conecta como `viajapro_webhook`).
   - `pnpm --filter @viajapro/api canal:registrar-prueba` para ligar el número de prueba a la agencia demo, y `META_SYSTEM_USER_TOKEN`, `META_PHONE_NUMBER_ID_PRUEBA`, `META_TENANT_ID_PRUEBA` para enviar.
   - Un túnel (`cloudflared tunnel --url http://localhost:3333`) y pegar `<túnel>/webhooks/whatsapp` (sin `/api/v1`) en Meta con el token de verificación. La URL cambia en cada reinicio.
   - Limitaciones de Meta vigentes en `CONTEXTO.md`: app sin publicar, solo webhooks de prueba del panel; el token temporal caduca a las 24 h.

## Qué falta para correr la jornada completa en local (máx. 8)

1. Redis y trabajador en marcha en la máquina (Docker o alternativa) y una corrida documentada de «mensaje entra, aparece en la bandeja».
2. Un mensaje real de un celular recibido y una respuesta de texto real recibida en ese celular (envío contra Meta real, hoy solo con Graph falsa).
3. Una cotización enviada por WhatsApp que llegue a un teléfono, desde la conversación, con la web contra la API real.
4. Una prueba automática web↔API (Playwright) que cubra ingreso, bandeja, cotización y seguimiento; hoy el CI no tiene ninguna.
5. `.env.example` coherente con el modo real (`USE_REAL_*=true`, `USE_REAL_AUTH=true`) y README con los pasos reales.
6. Exigir permisos en las mutaciones de la API (PR #191) antes de poner a más de un asesor.
7. Sustituir lo que hoy es `localStorage` o mock y la jornada necesita: lista de miembros (`GET /identidad/usuarios`), etapas del pipeline (`/crm/etapas`), plantillas y estado del canal; y retirar el margen del 20 % inventado de reportes.
8. Plantilla de reapertura fuera de la ventana de 24 h (T-078, bloqueada por Meta) y verificación del negocio (T-080) para salir del número de prueba.

## Qué en `ESTADO.md` era falso o caduco (corregido en este PR)

- Fecha 2026-10-28 con 82 commits posteriores en `main`.
- «Sin Redis ni trabajador»: el código existe y `inbox-bullmq.e2e-spec.ts` pasa en CI con Redis real. Lo que falta es ejecutarlo en una máquina del propietario.
- «Catálogo gestionable: M1/M2 sin aplicar, sin API ni pantallas»: hay API, pantallas, importador y ajustes; hay 30 migraciones y `CONTEXTO.md` registra M1/M2 aplicadas a Neon.
- «T-016 está en el PR #47, abierto»: integrado.
- «PR #44 integrado, PRs #46 y #48 abiertos», «roadmap v3 en el PR #43», «M1/M2 sin aplicar a Neon», «T-001, T-003, T-006, T-007 hechas; el resto en backlog»: desactualizados (hay 86 tareas `done`).
- «Cotizador, catálogo y bandeja usan la API; el resto es maqueta»: hoy contactos, pipeline, seguimientos e inicio también llaman a la API; lo que sigue en maqueta es otro conjunto (ver matriz).
- La fila «Avance» enumeraba como logros pantallas con datos locales (equipo, etapas, campos personalizados, WhatsApp en Configuración) sin decir que no tienen API.

## Decisiones tomadas

| Decisión | Razón | Dónde quedó registrada |
|---|---|---|
| Seguir en local hasta correr la jornada una vez; no contratar hosting aún | Ninguna capacidad es A; lo desplegado hoy no recibiría ni enviaría un mensaje real | Este documento y `ESTADO.md` |
| Una capacidad solo sube a «real» con prueba que incluya la web | La maqueta y el backend probado conviven y se confunden | `ESTADO.md` §1 |

## Qué quedó pendiente

- [ ] Corregir README («todavía no hay código de aplicación») y `.env.example` (`USE_REAL_*`, `USE_REAL_AUTH`). Toca `.env.example`: lo decide el propietario.
- [ ] Marcar T-089 como parcial y cerrar T-117 en `roadmap/tasks.yaml` (PR #198 integrado, la tarea sigue en `backlog`).
- [ ] Crear tareas para: `GET /identidad/usuarios`, `/crm/etapas`, estado del canal y plantillas, y quitar el margen fijo de `reportes-logica.ts`.
- [ ] Probar la web contra la API en el CI (Playwright).

## Qué aprendimos

- «Done» en `tasks.yaml` mide que se integró una rama, no que la capacidad funcione de punta a punta: T-089 y T-079 lo muestran.
- Las rutas que la web llama y la API no expone no fallan de forma visible: la web cae a `localStorage` o simula el guardado. Hay que contrastar `lib/*-api.ts` con los controladores antes de dar una pantalla por real.
- El CI verde certifica la API y el aislamiento entre agencias, no la web.
