---
name: nuevo-modulo
description: Crea un módulo de contexto delimitado completo en el monolito modular — estructura de cuatro capas, contratos, modelo de datos con RLS, eventos de dominio, rutas web y pruebas. Úsalo al abrir un contexto nuevo (inbox, quoting, booking, payments...) para que nazca con las fronteras bien puestas.
---

# Nuevo módulo de contexto delimitado

Un módulo nuevo es una frontera nueva. Si nace mal puesta, ya no se arregla: se hereda.

Antes de empezar, confirma con `arquitecto` que esto **es** un contexto delimitado y no una
funcionalidad de uno existente. La señal: un contexto delimitado tiene su propio lenguaje, su propio
ciclo de vida y podría, en teoría, ser un servicio separado. Si solo es "un grupo de pantallas",
no es un módulo.

---

## 1. Estructura

```
apps/api/src/modules/<contexto>/
├── domain/
│   ├── entities/            Entidades con sus invariantes. Sin framework.
│   ├── value-objects/       Lo que no tiene identidad propia.
│   ├── events/              Eventos de dominio que este módulo publica.
│   ├── ports/               Interfaces de lo que el módulo necesita del exterior.
│   └── errors/              Errores tipados del dominio.
├── application/
│   ├── commands/            Casos de uso que cambian estado.
│   ├── queries/             Casos de uso de lectura.
│   └── subscribers/         Reacción a eventos de otros módulos.
├── infrastructure/
│   ├── persistence/         Repositorios Prisma. Implementan los puertos.
│   ├── clients/             Clientes HTTP de terceros.
│   └── <contexto>.module.ts Cableado de NestJS.
└── interface/
    ├── http/                Controladores y DTO.
    ├── websocket/           Gateways, si aplica.
    └── queue/               Consumidores de BullMQ.
```

Regla de dependencia, hacia adentro: `interface` → `application` → `domain`.
`infrastructure` implementa interfaces declaradas en `domain`. **`domain` no importa de nadie.**

---

## 2. Lista de verificación

**Dominio**
- [ ] Entidades con invariantes que se hacen cumplir en el constructor, no en el caso de uso.
- [ ] Los value objects reutilizables salen a `packages/domain` (`Money`, `PhoneNumber`, `DateRange`).
- [ ] Eventos de dominio nombrados en pasado: `QuoteSent`, no `SendQuote`.
- [ ] Puertos declarados como interfaces aquí, no en `infrastructure`.

**Contratos**
- [ ] Esquemas Zod en `packages/contracts/src/<contexto>/`.
- [ ] Un solo lugar define cada tipo. El frontend importa de aquí, no redefine.

**Datos** (con el agente `datos`)
- [ ] Modelos Prisma con `tenant_id`, `created_at`, `updated_at`, `deleted_at`.
- [ ] Migración + política RLS con `USING` **y** `WITH CHECK`.
- [ ] Índices compuestos con `tenant_id` primero.
- [ ] Seed con datos realistas, no `test1`, `test2`.
- [ ] Prueba de aislamiento entre dos tenants.

**Comunicación con otros módulos**
- [ ] Ninguna importación directa de otro módulo.
- [ ] Lo que este módulo necesita de otro: por puerto o suscripción a evento.
- [ ] Eventos publicados por outbox, dentro de la misma transacción que el cambio de estado.
- [ ] Los eventos consumidos son idempotentes: pueden llegar dos veces.

**Interfaz HTTP**
- [ ] Validación con los esquemas Zod del contrato.
- [ ] Permisos verificados por endpoint, no asumidos por la UI.
- [ ] Paginación en todo listado, desde el primer día.
- [ ] Errores de dominio traducidos a HTTP por el filtro global, no con `try/catch` por ruta.

**Web**
- [ ] Rutas bajo `apps/web/src/app/(dashboard)/<contexto>/`.
- [ ] Los tres estados en cada vista: vacío, cargando, error.
- [ ] Componentes compartidos en `packages/ui`, no duplicados.

**Pruebas**
- [ ] Unitarias de las invariantes del dominio.
- [ ] Integración de los casos de uso contra Postgres real.
- [ ] Aislamiento entre tenants.
- [ ] End-to-end solo si el módulo tiene un flujo crítico del producto.

**Documentación**
- [ ] `docs/02-arquitectura/02-contextos-delimitados.md` actualizado con el módulo y sus relaciones.
- [ ] Términos nuevos en `docs/01-producto/02-lenguaje-ubicuo.md`.
- [ ] `ESTADO.md` actualizado.

---

## 3. Errores que se cometen siempre

- **Crear el módulo "por si acaso"**, sin una funcionalidad real que lo justifique. Un módulo vacío
  es una frontera que nadie respeta.
- **Importar de otro módulo "solo esta vez"**. Esa es la primera grieta; en seis meses son veinte.
- **Poner el tipo de Prisma como tipo del dominio.** Acopla el dominio a la base de datos para siempre.
- **Olvidar la política RLS "porque todavía no hay datos reales".** Llegarán antes de que te acuerdes.
