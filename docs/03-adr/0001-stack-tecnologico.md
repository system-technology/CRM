# ADR-0001 — TypeScript de punta a punta: NestJS, Next.js, PostgreSQL

- **Estado:** Aceptado
- **Fecha:** 2026-10-06
- **Decide:** Propietario del producto
- **Consultados:** `arquitecto`, `backend`, `frontend`, `datos`

---

## Contexto

Equipo pequeño construyendo un SaaS multi-tenant con mucha integración (WhatsApp, pasarelas de
pago, IA) y una interfaz densa en tiempo real. Las fuerzas:

- **Velocidad de un equipo chico.** No hay gente para especialistas separados de back y front.
- **Volumen de integraciones.** La mayor parte del trabajo es hablar con APIs de terceros.
- **Tiempo real.** La bandeja de mensajes es el corazón del producto.
- **Contratación.** El talento disponible en la región, a costo razonable.

## Opciones consideradas

### A — TypeScript end-to-end (elegida)
NestJS (API) + Next.js (web) + PostgreSQL + Prisma + Redis/BullMQ, en un monorepo pnpm + Turborepo.

- **Gana:** un solo lenguaje para todo el equipo; **tipos compartidos entre API y web**, que
  elimina una clase entera de errores de integración; el ecosistema más rico para integraciones
  y para I/O concurrente, que es casi todo lo que hace este sistema; abundante talento disponible.
- **Cuesta:** Node no es la mejor opción para cómputo intensivo (no lo necesitamos); la disciplina
  de tipos hay que imponerla (`strict`, sin `any`); el ecosistema se mueve rápido y envejece rápido.
- **Cierra:** poco relevante para este producto.

### B — .NET 8/9 + React
ASP.NET Core + React + SQL Server o PostgreSQL.

- **Gana:** plataforma madura y estable; excelente rendimiento; herramientas de primer nivel;
  si el equipo viene del mundo ERP (p. ej. Siesa), la curva es cero.
- **Cuesta:** dos lenguajes, dos ecosistemas, contratos duplicados entre back y front; menos
  ejemplos y SDKs para integraciones tipo WhatsApp Cloud API; licencias si se va con SQL Server;
  contratación más cara en la región.
- **Cierra:** la ventaja de tipos compartidos de extremo a extremo.

### C — Python + React
FastAPI o Django + React.

- **Gana:** el mejor ecosistema para IA y análisis de datos; desarrollo rápido.
- **Cuesta:** dos lenguajes; el tipado es opcional y en la práctica se degrada; concurrencia de
  I/O menos natural que en Node; menos idóneo para WebSocket a escala.
- **Cierra:** nada decisivo. La ventaja de IA se neutraliza porque consumimos la IA por API, no la
  entrenamos.

## Decisión

**Opción A: TypeScript de punta a punta.**

El factor decisivo no es el rendimiento ni la madurez —B gana en ambos— sino los **contratos
compartidos**. En un equipo pequeño, la fricción entre backend y frontend es el mayor consumidor de
tiempo, y un esquema Zod en `packages/contracts` que valida en la API y tipa el formulario en la
web elimina esa fricción por completo.

El segundo factor: este sistema es, en volumen de código, una máquina de hablar con APIs ajenas.
Ahí Node es el terreno natural.

Nota sobre la opción B: si el equipo final resulta ser mayoritariamente .NET, esta decisión merece
reconsiderarse antes de escribir código. La familiaridad del equipo vence a la elegancia de la
arquitectura, siempre.

### El stack, pieza por pieza

| Pieza | Elección | Por qué esta y no otra |
|---|---|---|
| Runtime | Node 22 LTS | Soporte largo. Bun y Deno todavía no para producción crítica. |
| API | NestJS | Estructura modular impuesta, inyección de dependencias, decoradores. Es lo que mantiene un monolito modular ordenado cuando crece. Express solo sería caos en seis meses. |
| Web | Next.js App Router | Server Components reducen el JavaScript enviado; enrutamiento y renderizado resueltos. |
| Base de datos | PostgreSQL 16 | **Row Level Security** es la razón decisiva (ver ADR-0003). Más JSONB, búsqueda de texto y `pg_trgm`. |
| ORM | Prisma | Tipos generados desde el esquema; migraciones versionadas. Para consultas analíticas pesadas se baja a SQL crudo sin drama. |
| Colas | BullMQ sobre Redis | Reintentos, backoff, trabajos programados, prioridades. Ya necesitamos Redis para caché y pub/sub. |
| Tiempo real | Socket.IO | Reconexión y respaldo resueltos. A escala, adaptador de Redis. |
| Validación | Zod | Un esquema que valida en runtime y genera el tipo. La base de `packages/contracts`. |
| Monorepo | pnpm + Turborepo | Enlaces eficientes, caché de tareas. |
| Pruebas | Vitest + Testcontainers + Playwright | Rápido; Postgres real en integración; navegador real en E2E. |
| Interfaz | Tailwind + shadcn/ui | Componentes que se copian al repositorio: se pueden modificar sin pelear con la librería. |

## Consecuencias

### Positivas
- Un solo lenguaje: cualquiera del equipo toca cualquier parte.
- Contratos compartidos: una clase entera de errores desaparece.
- Ecosistema rico para integraciones, que es el grueso del trabajo.
- Contratación más fácil y barata en la región.

### Negativas
- **Node no sirve para cómputo intensivo.** Si apareciera (optimización de itinerarios, por
  ejemplo), habría que resolverlo fuera del proceso principal.
- **La disciplina de tipos no viene gratis:** `strict`, `noUncheckedIndexedAccess`, prohibición de
  `any` verificada por el hook `PostToolUse` y por CI.
- **El ecosistema envejece rápido.** Dependencias auditadas trimestralmente; cada dependencia nueva
  exige justificación.
- Prisma añade una capa de indirección; en consultas complejas hay que bajar a SQL.

## Cuándo revisar esta decisión

- Si el equipo que finalmente construya esto es mayoritariamente .NET o Python: reconsiderar
  **antes** de escribir código, no después.
- Si aparece una necesidad real de cómputo intensivo sostenido.
- Si Prisma se convierte en un cuello de botella para consultas analíticas → migrar esa capa a
  Kysely o SQL directo, sin cambiar el resto.
