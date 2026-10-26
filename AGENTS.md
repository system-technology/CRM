# AGENTS.md — Contrato para cualquier agente de IA

> **Qué es este archivo.** `AGENTS.md` es el formato que leen la mayoría de las herramientas
> agénticas (Antigravity, Cursor, Codex, Copilot, OpenCode, Aider…). Existe para que **cualquier
> IA que toque este repositorio trabaje bajo las mismas reglas**, sin importar el harness.
>
> La fuente de verdad completa está en `CLAUDE.md` y en `docs/`. Este archivo es el extracto
> mínimo que nadie puede ignorar. Si los dos se contradicen, **manda `CLAUDE.md`** y hay que
> arreglar este.

---

## 1. Antes de tocar nada

1. Lee **`ESTADO.md`** — dónde estamos, qué sigue, qué está bloqueado. Es obligatorio.
2. Lee **`CLAUDE.md`** — las trece reglas completas y el mapa del sistema.
3. Si la tarea toca arquitectura, lee el ADR correspondiente en `docs/03-adr/`.
4. Si la tarea toca dominio, lee `docs/01-producto/02-lenguaje-ubicuo.md`.

**No confíes en tu memoria de la sesión anterior: no la tienes.** El hilo del proyecto vive en
archivos, no en conversaciones.

## 2. Qué es esto

**ViajaPro** (nombre en clave, no comercial): SaaS multi-tenant, CRM vertical para agencias de
turismo, con WhatsApp Cloud API como canal nativo. Mercado base: Colombia.

Estado: **en construcción, sin agencia real todavía.** Hay cotizador, catálogo, autenticación,
bandeja web, esquema del inbox y recepción de WhatsApp probada con el número de prueba de Meta.
Faltan el trabajador con Redis, el despliegue, el catálogo gestionable, pagos y automatizaciones.
El repositorio es público y `main` tiene protección de servidor.

> Este párrafo caduca. **La fuente de verdad del estado es `ESTADO.md`**, no este resumen.

Stack: TypeScript estricto · NestJS · Next.js · PostgreSQL + Prisma · Redis + BullMQ ·
monorepo pnpm + Turborepo.

## 3. Las trece reglas que no se rompen

| # | Regla |
|---|---|
| R1 | Toda tabla de negocio lleva `tenant_id` y política RLS con `USING` **y** `WITH CHECK` |
| R2 | La app se conecta con el rol `viajapro_app`, que **no puede saltarse RLS**. Nunca `postgres` |
| R3 | Los contratos viven en `packages/contracts` como esquemas Zod. Nadie redefine un tipo |
| R4 | Los módulos **no se importan entre sí**: eventos de dominio o puertos explícitos |
| R5 | Todo efecto externo (WhatsApp, pagos, correo) es **idempotente** y pasa por cola |
| R6 | **Ningún secreto en el repositorio.** Credenciales de tenant cifradas con AES-256-GCM |
| R7 | Decisión estructural = **ADR** en `docs/03-adr/`, escrito antes de implementarse |
| R8 | Dinero en **enteros, en la unidad mínima de la moneda** (en COP es el peso, no el centavo) + código ISO-4217. Nunca coma flotante |
| R9 | Fechas en **UTC** en la base; la zona del tenant solo en presentación |
| R10 | PII de viajeros (pasaporte, fecha de nacimiento) es **dato sensible**: cifrado y auditado |
| R11 | **En `main` solo entra lo que supera un PR con los 8 checks del CI y la rama al día** (auto-merge o `integrador`); nadie empuja directo. Las rutas protegidas esperan al propietario. Todo el trabajo va en ramas |
| R12 | **Se parametriza la política de negocio; nunca los invariantes del dominio.** Lo que cada agencia define distinto es tabla por tenant, no `enum` |
| R13 | **Una sola vuelta de revisión, salvo en aislamiento entre tenants.** Lo que no se corrige en esa vuelta va a la cola (`roadmap/tasks.yaml`) con dueño, no bloquea |

## 4. Git — esto es lo que más se incumple

```bash
# SIEMPRE, antes de cualquier trabajo:
git checkout main && git pull
git checkout -b feat/<contexto>-<descripcion>
```

- **Nunca commitees en `main`.** Un hook local lo bloquea, pero la regla es anterior al hook.
- Ramas de 1 a 3 días. Si el trabajo es más largo, **pártelo**.
- Commits en [Conventional Commits](https://www.conventionalcommits.org/) con scope de contexto:
  `feat(quoting): calcula markup por tipo de pasajero`. Scopes válidos en `commitlint.config.js`.
- La integración a `main` es **solo por pull request**: 8 checks en verde y rama al día, por
  auto-merge o por el agente `integrador`. El servidor rechaza el resto. Antes de cada bloque:
  `git fetch origin` y rama nueva desde `origin/main`. Ver `docs/07-ingenieria/03-git.md`.

## 5. Convenciones

- **TypeScript estricto. `any` prohibido.** Si el tipo es desconocido: `unknown` + validación Zod.
- Archivos `kebab-case.ts` · clases `PascalCase` · tablas y columnas `snake_case`.
- **Nombres de dominio en inglés en el código, documentación en español.** El diccionario es
  `docs/01-producto/02-lenguaje-ubicuo.md` y **no se negocia**: si dice `TravelFile`, no escribas
  `Booking`.
- Errores de dominio: clases tipadas que heredan de `DomainError`. Nunca `throw new Error('...')`.
- Nunca una llamada de red dentro de una transacción de base de datos.
- Estructura de módulo: `domain/` (sin framework) → `application/` → `infrastructure/` + `interface/`.

## 6. Comandos

```bash
pnpm dev          # api :3333 + web :3000
pnpm infra:up     # Postgres, Redis, MinIO, Mailpit, Jaeger
pnpm db:migrate
pnpm test
pnpm typecheck
pnpm lint
pnpm test:hooks   # política de protección de rama
```

## 7. Al terminar

1. Actualiza **`ESTADO.md`**.
2. Deja entrada en **`docs/_bitacora/AAAA-MM-DD-<tema>.md`**.
3. Sincroniza los documentos de `docs/` que tu cambio haya dejado desactualizados.

**Si una decisión no quedó escrita en uno de esos sitios, no existe.**

## 8. Límites

- No escribas código de aplicación mientras el proyecto esté en Fase 0 sin decirlo explícitamente.
- No agregues dependencias sin justificarlas.
- No toques migraciones ya aplicadas: se corrigen con una nueva.
- No uses librerías no oficiales de WhatsApp (Baileys, WPPConnect): violan los ToS de Meta.
- No integres servicios externos sin ADR y sin un adaptador detrás de un puerto.

---

## Para herramientas distintas de Claude Code

Este repositorio nació con un método de trabajo documentado en `docs/09-ia/`. Si vienes de otro
harness, lo esencial:

- **El equipo de agentes está en `.claude/agents/`** (20 roles en `CLAUDE.md` §8). Son archivos markdown legibles por
  cualquier herramienta: úsalos como descripciones de rol aunque tu harness no los cargue solo.
- **Los loops de trabajo están en `docs/09-ia/02-loops-de-trabajo.md`** y el cronograma en
  `docs/09-ia/06-cronograma-de-loops.md`.
- **Si eres una IA externa a la que se delegó una tarea puntual**, tu contrato está en
  `docs/09-ia/05-interoperabilidad-multi-ia.md`. Lo que devuelvas **se audita antes de integrarse**:
  `auditor-codigo` siempre, `auditor-seguridad` si toca cualquier dato. Las pruebas las escribimos
  nosotros, no se aceptan las tuyas.
- **Dónde encajas mejor:** verificación en navegador (end-to-end, revisión visual), segunda opinión
  sobre decisiones de diseño, y trabajo acotado de alto volumen con criterio de aceptación objetivo.
- **Dónde no:** aislamiento entre tenants, credenciales, esquema de datos, lógica de pagos y
  decisiones de arquitectura. Ahí el modo de fallo «plausible pero incorrecto» es demasiado caro.

---

## Nota sobre las herramientas del monorepo

`turbo` y el resto de la cadena de construcción cambian de comportamiento entre versiones, y la
memoria de cualquier modelo sobre ellas envejece. Antes de modificar `turbo.json` o un script de
`package.json`, consulta la documentación de la versión **instalada**, no la que recuerdes:

```bash
node -p "require.resolve('turbo/package.json')"   # y lee docs/README.md dentro de ese paquete
```

Turborepo inyecta por su cuenta un bloque de instrucciones al final de este archivo cuando detecta
que lo lee un agente. Se desactivó con `"agentGuidance": false` en `turbo.json`: **este documento es
el contrato de gobierno del proyecto**, y lo que diga lo decide el proyecto. Lo útil de ese bloque
es justamente el párrafo de arriba, ya recogido aquí en nuestros términos.
