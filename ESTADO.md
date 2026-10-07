# ESTADO — El hilo vivo de ViajaPro

> **Este es el primer archivo que lee cualquier persona o agente al abrir el proyecto.**
> Responde tres preguntas: dónde estamos, qué sigue, qué está bloqueado.
> Se actualiza al cerrar **cada** sesión de trabajo. Si está desactualizado, el hilo se rompió.

| Campo | Valor |
|---|---|
| Última actualización | 2026-10-07 |
| Actualizado por | Sesión de fundación (Claude Opus 5) |
| Fase | **Fase 0 — Fundaciones** |
| Avance de la fase | Andamiaje completo y versionado en v0.1.0. Falta andamiaje de código |
| Próximo hito | Cierre de Fase 0 y arranque de Fase 1 (Inbox) |

---

## 1. Dónde estamos

El repositorio tiene el **andamiaje completo**: estructura de monorepo con su configuración,
documentación de visión, producto, arquitectura, seguridad y roadmap, cinco ADR aceptados, la capa
de ingeniería asistida por IA (17 agentes, 5 skills, 7 comandos, 6 hooks, MCP) y el gobierno de la
integración a `main`.

**No existe código de aplicación.** Nada está desplegado. No hay base de datos creada.
No hay cuenta de Meta Business iniciada.

Qué hay, concretamente:

| Área | Estado |
|---|---|
| Configuración del monorepo | Escrita, **sin ejecutar** (`pnpm install` nunca corrió) |
| Documentación | 33 documentos completos + 22 marcadores con responsable y fase |
| ADR | 0001 stack · 0002 WhatsApp · 0003 multi-tenancy · 0004 monolito modular · 0005 ramas |
| Agentes de IA | 17 definidos en `.claude/agents/`, incluido `integrador` |
| Skills | `ciclo-funcionalidad`, `auditoria-integral`, `handoff-ia-externa`, `cerrar-sesion`, `nuevo-modulo` |
| Comandos | `/estado` `/auditoria` `/funcionalidad` `/handoff` `/adr` `/contexto` `/integrar` |
| Hooks | Inyección del hilo, guardián de secretos, guardián de rama, autorización de integración, revisión post-edición, recordatorio de cierre |
| MCP | 8 servidores declarados, **ninguno validado** |
| Repositorio | Commit de génesis `v0.1.0` en `main`. **Sin remoto todavía** |
| Gobierno de `main` | Compuerta activa y probada: commit sin autorizar y reescritura de historial, ambos rechazados |

## 2. Decisiones ya tomadas (no reabrir sin ADR que las supersede)

| Decisión | Valor | Dónde quedó |
|---|---|---|
| Canal de WhatsApp | Meta Cloud API + Embedded Signup, como Tech Provider | ADR-0002 |
| Stack | TypeScript end-to-end: NestJS + Next.js + PostgreSQL + Prisma + Redis | ADR-0001 |
| Arquitectura | Monolito modular por contexto delimitado, tres procesos | ADR-0004 |
| Multi-tenancy | Esquema compartido + `tenant_id` + Row Level Security forzada | ADR-0003 |
| **Mercado base** | **Colombia.** Moneda COP, normativa colombiana, TRM, pasarelas locales | Decisión del propietario, 2026-10-06 |
| **Modelo de ramas** | **`main` protegida. Solo el agente `integrador` escribe ahí**, tras siete compuertas. Trabajo en ramas de 1-3 días | ADR-0005 |
| Alcance v1 | Los cuatro bloques, secuenciados en fases. Primer cobro al mes 4 | `docs/01-producto/01-alcance-mvp.md` |
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
| 1 | **Iniciar verificación de Meta Business y solicitud de Tech Provider** | Usuario | **Camino crítico — hoy** |
| 2 | Conseguir agencia piloto comprometida | Usuario | Urgente |
| 3 | **Crear repositorio remoto y configurar la protección de `main` en GitHub** | Usuario | Antes del primer push |
| 4 | Validar MCP: ejecutar cada servidor de `.mcp.json`, incluido Stitch (`gcloud auth` requerido) | Usuario + `devops` | Pendiente |
| 5 | Andamiaje de código: apps y packages vacíos pero compilando (`pnpm install && pnpm typecheck` en verde) | `backend`, `frontend`, `devops` | Pendiente |
| 6 | Esquema Prisma inicial + políticas RLS + seed + prueba de aislamiento | `datos` | Pendiente |
| 7 | CI en GitHub Actions: lint, typecheck, test, escaneo de secretos | `devops` | Pendiente |
| 8 | Validar el modelo de dominio con la agencia piloto | `experto-turismo` + usuario | Bloqueado por #2 |
| 9 | Escribir los documentos de Fase 0 marcados como pendientes | Según marcador | Pendiente |
| 10 | **Definir nombre comercial**, verificar marca y dominio | Usuario | Antes de Fase 2 |
| 11 | **Definir modelo de cobro y precios** tras medir el costo real por tenant | Usuario + `analista-datos` | Antes de cobrar |
| 12 | Entrevistar 8-10 agencias colombianas: qué pagan hoy, qué les duele, cuánto vale resolverlo | Usuario + `analista-producto` | Alimenta #10 |

## 4. Bloqueos y riesgos activos

| Bloqueo | Impacto | Dueño | Mitigación |
|---|---|---|---|
| Verificación de Meta Business sin iniciar | **Bloquea toda la Fase 1 en producción.** Puede tardar semanas | Usuario | Iniciar el trámite ya; desarrollar contra números de prueba de Meta mientras tanto |
| Sin agencia piloto confirmada | Riesgo de construir nueve meses a ciegas | Usuario | Conseguirla antes de terminar la Fase 1 |
| Alcance de v1 vs. expectativa de calendario | Riesgo de cinco cosas a medias | Usuario | Roadmap por fases ya escrito; decidir dónde cortar |
| MCP sin validar | Los agentes no tienen las herramientas que el método asume | Usuario | Requiere sesión interactiva — no se puede hacer automatizado |
| **Sin repositorio remoto: `main` no tiene protección de servidor** | Los hooks locales son barandilla, no muro. La regla R11 depende hoy de disciplina | Usuario | Crear el remoto y configurar branch protection **antes del primer push**. Ver `.github/PROTECCION-DE-RAMA.md` |
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
