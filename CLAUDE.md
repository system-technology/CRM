# CLAUDE.md — Contexto maestro de ViajaPro

Este archivo se carga en **todas** las sesiones. Es la memoria corta del proyecto: lo que cualquier
agente necesita saber antes de tocar nada. Mantenerlo por debajo de ~400 líneas; lo que crezca se
mueve a `docs/` y aquí queda solo el enlace.

---

## 1. Qué es este proyecto

**ViajaPro** es un SaaS multi-tenant: un CRM vertical para **agencias de turismo**, con
**WhatsApp Cloud API** como canal nativo de primera clase. No es un CRM genérico con un plugin de
WhatsApp: el dominio del turismo (pasajeros, tarifas netas, itinerarios, archivos de viaje,
proveedores) está en el núcleo del modelo.

Estado actual: **rebanada vertical de paquetes, en construcción.** La Fase 0 está cerrada y
verificada: el dominio, la base de datos con RLS y la API del catálogo funcionan contra Neon.
Falta el frontend y el inbox de WhatsApp. Ver `ESTADO.md` para el punto exacto del hilo.

## 2. Antes de hacer cualquier cosa

1. Leer `ESTADO.md` — es el hilo vivo: en qué vamos, qué sigue, qué está bloqueado.
2. Si la tarea toca arquitectura, leer el ADR correspondiente en `docs/03-adr/`.
3. Si la tarea toca dominio, leer `docs/02-arquitectura/02-contextos-delimitados.md` y
   `docs/01-producto/02-lenguaje-ubicuo.md`. **El lenguaje ubicuo no se negocia**: si el documento
   dice `Archivo de viaje`, el código dice `TravelFile`, no `Booking`, no `Order`.
4. Al terminar, actualizar `ESTADO.md` y dejar entrada en `docs/_bitacora/`.

## 3. Reglas que no se rompen

| # | Regla | Por qué |
|---|---|---|
| R1 | **Toda tabla de negocio lleva `tenant_id` y política RLS.** Sin excepción. | Una fuga entre agencias mata el producto. Ver ADR-0003. |
| R2 | **Ninguna consulta usa el rol `postgres`.** La app entra con `viajapro_app`, que no puede saltarse RLS. | Defensa en profundidad: un bug de `WHERE` no se vuelve una brecha. |
| R3 | **Los contratos viven en `packages/contracts` como esquemas Zod.** API y web importan de ahí; nadie redefine tipos. | Una sola fuente de verdad entre back y front. |
| R4 | **Los módulos no se importan entre sí directamente.** Se comunican por eventos de dominio o por puertos explícitos. | Es lo que permite extraer servicios después sin reescribir. Ver ADR-0004. |
| R5 | **Todo efecto externo (WhatsApp, pagos, correo) es idempotente y pasa por cola.** | Meta reintenta webhooks; las pasarelas también. Duplicar un cobro es imperdonable. |
| R6 | **Ningún secreto en el repositorio.** Credenciales de tenant cifradas en reposo con AES-256-GCM. | Guardamos tokens de WhatsApp de terceros. |
| R7 | **Decisión estructural = ADR.** Si cambia la forma del sistema, se escribe antes de implementarse. | Sin esto el "por qué" se pierde en tres meses. |
| R8 | **Dinero en enteros (centavos) + código ISO-4217.** Nunca `float`. | Multi-moneda con TRM; los redondeos se cobran caro. |
| R9 | **Fechas en UTC en la base; la zona horaria del tenant solo en presentación.** | Agencias en varios husos; los vuelos cruzan fechas. |
| R10 | **PII de viajeros (pasaporte, fecha de nacimiento) se trata como dato sensible**: cifrado y acceso auditado. | Ley 1581 de 2012. Ver `docs/05-seguridad/02-proteccion-de-datos.md`. |
| R11 | **En `main` solo escribe el agente `integrador`**, y solo tras superar las siete compuertas. Todo el trabajo va en ramas. | Los agentes producen más rápido de lo que nadie revisa. Sin compuerta, entra a producción lo que nadie miró. Ver ADR-0005. |
| R12 | **Se parametriza la política de negocio; nunca los invariantes del dominio.** Lo que cada agencia define distinto es tabla por tenant, no `enum`. | Sin configurabilidad perdemos clientes; con configurabilidad infinita nos volvemos un CRM genérico y perdemos la ventaja. Ver ADR-0006. |

## 4. Stack

- **Lenguaje:** TypeScript estricto, Node 22 LTS. `strict: true`, `noUncheckedIndexedAccess: true`.
- **API:** NestJS — monolito modular, un módulo por contexto delimitado.
- **Web:** Next.js (App Router) + React + Tailwind + shadcn/ui + TanStack Query.
- **Datos:** PostgreSQL 16 + Prisma. RLS activo. Migraciones versionadas.
- **Colas y tiempo real:** Redis + BullMQ. Socket.IO para la bandeja en vivo.
- **Objetos:** S3 (MinIO en local) para media de WhatsApp, PDFs y documentos de viajeros.
- **IA:** Claude API (`claude-sonnet-5` por defecto, `claude-haiku-4-5-20251001` para alto volumen).
- **Monorepo:** pnpm workspaces + Turborepo.

Detalle y alternativas descartadas: `docs/03-adr/0001-stack-tecnologico.md`.

## 5. Mapa del código

```
apps/api        NestJS. src/modules/<contexto>/ — cada uno con domain/ application/ infrastructure/ interface/
apps/web        Next.js. src/app/(dashboard)/<contexto>/
apps/worker     BullMQ. src/jobs/<contexto>/
packages/contracts   Zod + tipos compartidos. FUENTE DE VERDAD de los contratos.
packages/database    schema.prisma, migrations/, policies/ (RLS), seed/
packages/domain      Value objects puros: Money, PhoneNumber, DateRange, PassengerCount
packages/ui          Sistema de diseño
packages/sdk         Cliente tipado generado
```

Contextos delimitados (módulos): `identity`, `inbox`, `crm`, `quoting`, `booking`, `payments`,
`automation`, `analytics`, `notifications`, `audit`.

## 6. Convenciones rápidas

- **Commits:** Conventional Commits con scope de contexto — `feat(quoting): agrega markup por pasajero`.
- **Ramas:** `main` es intocable. Toda tarea empieza con
  `git checkout main && git pull && git checkout -b feat/<contexto>-<descripción>`.
  Ramas de 1-3 días; si es más largo, se parte. Integración solo por `/integrar`. Ver
  `docs/07-ingenieria/03-git.md`.
- **Archivos:** `kebab-case.ts`. Clases `PascalCase`. Funciones y variables `camelCase`.
  Constantes `SCREAMING_SNAKE`. Tablas y columnas en la base: `snake_case`.
- **Nombres de dominio en inglés en el código, documentación en español.** El lenguaje ubicuo mapea
  ambos: `docs/01-producto/02-lenguaje-ubicuo.md` es el diccionario.
- **Pruebas:** co-localizadas, `*.spec.ts` (unitarias) y `*.e2e-spec.ts` (integración).
- **Errores:** nunca `catch` silencioso. Los errores de dominio son clases tipadas, no cadenas.

## 7. Comandos

```bash
pnpm dev              # api :3333 + web :3000
pnpm infra:up         # Postgres, Redis, MinIO, Mailpit, Jaeger
pnpm db:migrate       # aplicar migraciones
pnpm db:seed          # agencia demo
pnpm test             # pruebas
pnpm typecheck        # verificación de tipos en todo el monorepo
pnpm lint
```

## 8. Equipo de agentes

Este proyecto se desarrolla con agentes especializados. **No improvisar roles**: usar el agente que
corresponde, definido en `.claude/agents/`.

| Agente | Para qué |
|---|---|
| `arquitecto` | Diseño de sistema, ADRs, límites entre contextos |
| `experto-turismo` | Validar que el modelo refleja cómo opera una agencia real |
| `analista-producto` | Historias de usuario, criterios de aceptación, alcance |
| `backend` | Módulos NestJS, casos de uso, puertos y adaptadores |
| `frontend` | Next.js, componentes, estados de UI |
| `datos` | Esquema Prisma, migraciones, políticas RLS, rendimiento de consultas |
| `whatsapp` | Cloud API, webhooks, plantillas, ventana de 24h, Embedded Signup |
| `auditor-codigo` | Revisión de calidad, deuda técnica, simplificación |
| `auditor-seguridad` | Amenazas, aislamiento de tenants, secretos, OWASP, cumplimiento |
| `qa` | Estrategia y escritura de pruebas, casos borde |
| `devops` | CI/CD, infraestructura, observabilidad, despliegue |
| `documentador` | Mantener `docs/` sincronizada con la realidad del código |
| `diseno-ux` | Flujos de pantalla, sistema de diseño, prototipado con Stitch |
| `analista-datos` | Métricas, embudos, unit economics |
| `ingeniero-ia` | Las capacidades de IA **del producto** (no esta capa de agentes) |
| `investigador` | Información externa verificable: precios de Meta, normativa, competencia |
| **`integrador`** | **Guardián de `main`. Única vía de integración.** Ver R11 |

Modelo operativo completo, loops y protocolo de traspaso: `docs/09-ia/01-modelo-operativo.md`.

## 9. Cómo no perder el hilo

El hilo se sostiene en **cuatro artefactos**, en este orden de autoridad:

1. **`ESTADO.md`** — dónde estamos ahora. Se actualiza al cerrar cada sesión de trabajo.
2. **`docs/03-adr/`** — por qué el sistema es como es. Inmutable: un ADR no se edita, se supersede.
3. **`docs/_bitacora/AAAA-MM-DD-<tema>.md`** — qué pasó en cada sesión y qué quedó pendiente.
4. **`docs/08-roadmap/01-roadmap.md`** — hacia dónde vamos.

Regla: **si una decisión no quedó en uno de estos cuatro, no existe.** No confiar en la memoria de
la conversación ni en la de ningún modelo.

## 10. Límites

- **Nunca commitear en `main`.** Si la sesión arranca ahí, lo primero es crear la rama de trabajo.
- No agregar dependencias sin justificarlas; cada una es deuda. Preferir la biblioteca estándar.
- No tocar migraciones ya aplicadas en `packages/database/migrations/`: se corrigen con una nueva.
- No integrar servicios externos sin un ADR y sin un adaptador detrás de un puerto.
- No usar librerías no oficiales de WhatsApp (Baileys, WPPConnect): violan los ToS de Meta. ADR-0002.
