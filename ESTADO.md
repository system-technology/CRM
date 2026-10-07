# ESTADO — El hilo vivo de ViajaPro

> **Este es el primer archivo que lee cualquier persona o agente al abrir el proyecto.**
> Responde tres preguntas: dónde estamos, qué sigue, qué está bloqueado.
> Se actualiza al cerrar **cada** sesión de trabajo. Si está desactualizado, el hilo se rompió.

| Campo | Valor |
|---|---|
| Última actualización | 2026-10-07 (sesión nocturna autónoma — diseño y frontend) |
| Actualizado por | Claude Opus 5 |
| Fase | **Rebanada vertical de paquetes, en construcción** |
| Avance de la fase | **Cotizador funcionando de punta a punta: web → API → Neon.** v0.9.0 |
| Próximo hito | Inbox de WhatsApp |

---

## 1. Dónde estamos

El repositorio tiene el **andamiaje completo**: estructura de monorepo con su configuración,
documentación de visión, producto, arquitectura, seguridad y roadmap, cinco ADR aceptados, la capa
de ingeniería asistida por IA (17 agentes, 5 skills, 7 comandos, 6 hooks, MCP) y el gobierno de la
integración a `main`.

**El cotizador funciona de punta a punta** —navegador, API, Neon— y está verificado abriéndolo en
un navegador real, no solo compilando. Lo que NO existe todavía: inbox de WhatsApp, persistencia de
cotizaciones, autenticación, y nada desplegado en un servidor. No hay cuenta de Meta Business
iniciada.

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
| ADR | 0001 stack · 0002 WhatsApp · 0003 multi-tenancy · 0004 monolito modular · 0005 ramas · 0006 parametrización · 0007 Neon |
| Agentes de IA | 17 definidos en `.claude/agents/`, incluido `integrador` |
| Skills | `ciclo-funcionalidad`, `auditoria-integral`, `handoff-ia-externa`, `cerrar-sesion`, `nuevo-modulo` |
| Comandos | `/estado` `/auditoria` `/funcionalidad` `/handoff` `/adr` `/contexto` `/integrar` |
| Hooks | Inyección del hilo, guardián de secretos, guardián de rama (con 24 pruebas), autorización de integración, revisión post-edición, recordatorio de cierre |
| MCP | **Stitch conectado y usado** (ámbito de usuario, 15 herramientas). `navegador` usado para verificar la interfaz. `memoria`, `docs-librerias`, `razonamiento` cargados. **`postgres` falla al conectar.** `github` y `sentry` sin autorizar |
| Fase 0 técnica | **COMPLETA Y VERIFICADA.** API viva, 7/7 aislamiento, 32/32 dominio |
| Backend | `apps/api` con catálogo y cotización. Probado con peticiones reales |
| Frontend | `apps/web`: Next.js 15 + Tailwind 4. **Cotizador verificado en navegador.** No hay autenticación: el tenant va por cabecera de desarrollo, solo con `APP_ENV=local` |
| Diseño | Sistema de diseño subido a Stitch (proyecto `8333038101997719867`). Tokens replicados en `apps/web/src/app/globals.css`. Capturas en `docs/_assets/diseno/` |
| Datos | Agencia demo sembrada: 3 paquetes, 5 temporadas, 26 precios |
| Contrato multi-harness | `AGENTS.md` en la raíz: cualquier IA trabaja bajo las mismas once reglas |
| Repositorio | [github.com/Alfavear/CRM](https://github.com/Alfavear/CRM) · **privado** · `main` en **v0.9.0** |
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
| 2 | **Conseguir agencia piloto** y pedirle un tarifario real de mayorista | Usuario | Urgente. El catálogo se modeló con datos verosímiles, no reales |
| 3 | Reparar la conexión del MCP `postgres` o retirarlo de `.mcp.json` | `devops` | Falla con `CONNECTION_CLOSED` |
| 4 | Inbox de WhatsApp: webhook, firma, idempotencia, ventana de 24h | `whatsapp`, `backend` | **Siguiente pieza grande** |
| 5 | Bandeja de conversaciones en la web | `frontend` | El diseño existe; falta el backend del inbox (tarea 4) |
| 6 | Guardar cotizaciones con versiones inmutables | `backend` | Hoy el cálculo no persiste |
| 7 | Pruebas de integración de la API | `qa` | Solo se probó a mano. **La verificación del cotizador fue manual: no hay prueba automática que la repita** |
| 8 | CI en GitHub Actions corriendo de verdad | `devops` | Escrito, nunca ejecutado |
| 9 | Decidir nombre comercial, modelo de cobro y precios | Usuario | Antes de vender |
| 10 | Resolver la protección de `main` en GitHub | Usuario | Plan gratuito no la permite en repos privados |
| 11 | **Rotar la contraseña de Neon y la clave de API de Stitch** | Usuario | Ambas se pegaron en el chat. Un secreto expuesto no se borra, se rota |
| 12 | Autenticación: el `tenant_id` debe salir del token de sesión | `backend` | Hoy la web lo envía por cabecera. Solo funciona con `APP_ENV=local`, pero es deuda que bloquea desplegar |

## 4. Bloqueos y riesgos activos

| Bloqueo | Impacto | Dueño | Mitigación |
|---|---|---|---|
| Verificación de Meta Business sin iniciar | **Bloquea lanzar con clientes reales, NO bloquea construir.** Tarda semanas | Usuario | Arrancar el trámite en paralelo. Mientras tanto se desarrolla con el número de prueba de Meta |
| Sin agencia piloto confirmada | Riesgo de construir nueve meses a ciegas | Usuario | Conseguirla antes de terminar la Fase 1 |
| Alcance de v1 vs. expectativa de calendario | Riesgo de cinco cosas a medias | Usuario | Roadmap por fases ya escrito; decidir dónde cortar |
| MCP sin validar | Los agentes no tienen las herramientas que el método asume | Usuario | Requiere sesión interactiva — no se puede hacer automatizado |
| **`main` sin protección de servidor** — el plan gratuito de GitHub no permite proteger ramas en repos privados | La regla R11 depende hoy solo de disciplina y de hooks locales. Tolerable con una persona; **no lo es con dos** | Usuario | GitHub Pro (recomendado), o repo público, o riesgo asumido. Ver `.github/PROTECCION-DE-RAMA.md` |
| Nada comercial está definido: nombre, precios, planes | No se puede vender ni proyectar ingresos | Usuario | Definirlo con datos del piloto, no antes |
| Nombre en clave `ViajaPro` extendido por todo el repositorio | Si se decide otro nombre hay que renombrar | Usuario | Barato mientras no haya código. Un comando `sed`. Caro con clientes |
| Revisión legal de protección de datos pendiente | No se puede salir a producción sin ella | Usuario | Abogado del país de operación, antes de Fase 4 |

## 5. Preguntas abiertas

1. **¿Qué agencia colombiana será el piloto?** Sin un cliente real, la Fase 1 se construye a ciegas.
2. **¿Nombre comercial?** Hoy `ViajaPro` es solo un identificador técnico.
3. **¿Modelo de cobro?** Por asesor, por conversación, por tramos, o base + consumo. Cada uno cambia
   qué hay que medir en el producto desde el primer día.
4. ¿Qué pasarela usan hoy las agencias colombianas: Wompi, PayU, ePayco o Mercado Pago? Bloquea la Fase 4.
5. ¿Facturación electrónica DIAN desde v1, o se delega al ERP de la agencia?
6. ¿Agencias minoristas, operadores receptivos, o ambos? El brochure sugiere minoristas; confirmarlo
   cambia el peso del cotizador frente al de la operación.
7. ¿Presupuesto mensual tope para la capa de IA? Define si la Fase 5 usa el modelo rápido o el fuerte.
8. ¿Cuántas personas tendrá el equipo? El roadmap asume 3-4. Con 2 se duplica el calendario.

## 6. Bitácora

- [`2026-10-07-primera-interfaz.md`](docs/_bitacora/2026-10-07-primera-interfaz.md) ← **empieza por aquí**
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
