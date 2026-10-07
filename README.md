# ViajaPro

> **Convierte conversaciones en viajes reales.**
> CRM vertical para agencias de turismo, con WhatsApp como canal nativo de primera clase.
>
> **`ViajaPro` es un nombre en clave, no el nombre comercial.** Se usa como identificador técnico
> (`@viajapro/*`, `viajapro_app`). Nada comercial está decidido: ni el nombre, ni los precios, ni
> los planes. Cambiarlo hoy es un comando; con clientes, una migración.
>
> **Mercado base: Colombia.** El norte de producto está en
> [`docs/00-vision/05-norte-del-producto.md`](docs/00-vision/05-norte-del-producto.md).

---

## El problema

Una agencia de turismo en crecimiento opera hoy con WhatsApp personal en varios celulares, Excel
para cotizar, correo para confirmar y la memoria de un asesor para hacer seguimiento. Las
consecuencias son siempre las mismas:

- **Leads que se evaporan.** Nadie sabe cuantas consultas entraron ni cuantas se cotizaron.
- **Conocimiento secuestrado.** Si el asesor se va, se lleva el historial de sus clientes.
- **Cotizar es artesanal.** Dos horas para armar una propuesta que el cliente lee en treinta segundos.
- **Cero recompra.** El mejor cliente es el que ya viajo, y nadie vuelve a hablarle.
- **El dueño vuela a ciegas.** No hay tasa de conversion, ni margen por archivo, ni ranking de asesores.

Los CRM genericos (HubSpot, Pipedrive, Zoho) no entienden el dominio: no saben que es un pasajero,
una tarifa neta, un itinerario multi-destino ni un archivo de viaje. Las herramientas de WhatsApp
multi-agente resuelven la bandeja pero no el negocio.

## La solucion

Un CRM que nace dentro de WhatsApp y habla el idioma del turismo:

| Capacidad | Que resuelve |
|---|---|
| **Inbox omnicanal** | Un numero oficial de WhatsApp compartido por todo el equipo, con asignacion, SLA e historial unificado por viajero. |
| **Pipeline comercial** | Embudo con etapas propias del sector (consulta → calificado → cotizado → bloqueo → confirmado → en viaje → post-venta). |
| **Cotizador de viajes** | Armado de propuestas multi-opcion con tarifas netas, markup, impuestos y multi-moneda; PDF de marca enviado por WhatsApp en un clic. |
| **Reservas y pagos** | Archivo de viaje con pasajeros, documentos, proveedores, cuotas y conciliacion de pagos. |
| **Automatizacion e IA** | Calificacion automatica de leads, extraccion de intencion de viaje desde el chat, respuestas sugeridas y seguimientos que se disparan solos. |
| **Analitica** | Conversion por etapa, margen por archivo, productividad por asesor, origen de los leads. |

## Decisiones fundacionales

| Eje | Decision | ADR |
|---|---|---|
| Canal de WhatsApp | Meta **Cloud API** + Embedded Signup como Tech Provider | [ADR-0002](docs/03-adr/0002-whatsapp-cloud-api.md) |
| Stack | TypeScript de punta a punta: NestJS + Next.js + PostgreSQL + Prisma + Redis | [ADR-0001](docs/03-adr/0001-stack-tecnologico.md) |
| Arquitectura | Monolito modular por contexto delimitado, con frontera lista para extraer servicios | [ADR-0004](docs/03-adr/0004-monolito-modular.md) |
| Multi-tenancy | Esquema compartido + `tenant_id` + **Row Level Security** en PostgreSQL | [ADR-0003](docs/03-adr/0003-multitenancy.md) |
| Modelo de negocio | SaaS multi-tenant en la nube, suscripcion por usuario + consumo de conversaciones | [Modelo de negocio](docs/00-vision/04-modelo-de-negocio.md) |

## Por donde empezar a leer

1. [Vision de producto](docs/00-vision/01-vision-producto.md) — que estamos construyendo y por que.
2. [Alcance del MVP](docs/01-producto/01-alcance-mvp.md) — que entra y que no en la version 1.
3. [Arquitectura general](docs/02-arquitectura/01-vision-general.md) — el mapa del sistema.
4. [Contextos delimitados](docs/02-arquitectura/02-contextos-delimitados.md) — como se parte el dominio.
5. [Roadmap](docs/08-roadmap/01-roadmap.md) — el plan de entregas por fases.

El indice completo de la documentacion esta en [`docs/README.md`](docs/README.md).

## Estructura del repositorio

```
.
├── apps/
│   ├── api/          API HTTP + webhooks (NestJS). Monolito modular.
│   ├── web/          Aplicacion web (Next.js App Router).
│   └── worker/       Procesadores de colas y trabajos programados (BullMQ).
├── packages/
│   ├── contracts/    Esquemas Zod y tipos compartidos entre API y web. Fuente de verdad.
│   ├── database/     Esquema Prisma, migraciones, politicas RLS y seeds.
│   ├── domain/       Tipos puros del dominio: value objects, enums, invariantes.
│   ├── sdk/          Cliente tipado de la API, generado desde contracts.
│   ├── ui/           Sistema de diseño (React + Tailwind + shadcn/ui).
│   └── config/       Presets compartidos: eslint, tsconfig, tailwind.
├── infra/
│   ├── docker/       Entorno local (Postgres, Redis, MinIO, Mailpit, Jaeger).
│   ├── terraform/    Infraestructura como codigo de los entornos reales.
│   └── k8s/          Manifiestos de despliegue.
├── docs/             Toda la documentacion del proyecto. Ver docs/README.md.
└── .github/workflows CI/CD.
```

## Puesta en marcha local

> Todavia no hay codigo de aplicacion. Estos pasos quedan definidos para que la Fase 0 del
> roadmap los deje funcionando sin discusion.

```bash
# 1. Requisitos: Node 22.11+ y pnpm 9+. Docker es opcional (ver paso 4).
corepack enable && corepack prepare pnpm@9.12.0 --activate

# 2. Dependencias
pnpm install

# 3. Variables de entorno
cp .env.example .env     # completar los valores marcados

# 4. Arrancar todo
pnpm dev                 # api :3333 | web :3000
```

### Paso 4 — Base de datos: dos caminos

**a) PostgreSQL gestionado en Neon** *(recomendado: no hay que instalar nada)*

Crear un proyecto en [neon.tech](https://neon.tech), copiar las cadenas al `.env` y crear el rol
de aplicación — el que **no puede saltarse Row Level Security**:

```bash
psql "$DATABASE_URL" -v app_password="$(openssl rand -base64 24)" \
     -f packages/database/prisma/policies/002-rol-aplicacion.sql
```

> **No te saltes ese script.** El rol que Neon crea por defecto hereda `neon_superuser`, que tiene
> `BYPASSRLS`: conectando la aplicación con él, el aislamiento entre agencias sería ficticio —
> sin error y sin aviso. Ver [ADR-0007](docs/03-adr/0007-postgres-gestionado-neon.md).

**b) PostgreSQL local con Docker**

```bash
pnpm infra:up            # Postgres, Redis, MinIO, Mailpit, Jaeger
```

Servicios auxiliares en local: MinIO `:9001`, Mailpit `:8025`, Jaeger `:16686`.

### Paso 5 — Migraciones y datos de ejemplo

```bash
pnpm db:migrate
pnpm db:seed             # agencia demo + usuarios + catálogo de ejemplo
pnpm --filter @viajapro/database test:aislamiento   # la compuerta que importa
```

## Convenciones

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) con el scope restringido
  a los contextos del dominio (`feat(quoting): ...`). Ver `commitlint.config.js`.
- **Ramas:** `main` es intocable — solo el agente `integrador` escribe ahí, tras siete compuertas.
  Todo el trabajo va en ramas cortas `feat/`, `fix/`, `chore/`, `docs/`. Ver
  [git y ramas](docs/07-ingenieria/03-git.md).
- **Codigo:** ver [convenciones de ingenieria](docs/07-ingenieria/01-convenciones.md).
- **Decisiones de arquitectura:** toda decision estructural se registra como ADR en `docs/03-adr/`.

## Estado del proyecto

**Fase 0 — Fundaciones.** El repositorio contiene el andamiaje documental y de configuracion.
No hay codigo de aplicacion todavia. Ver el [roadmap](docs/08-roadmap/01-roadmap.md).
