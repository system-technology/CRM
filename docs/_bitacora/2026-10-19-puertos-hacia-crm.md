# 2026-10-19 — Los dos accesos directos a `crm` pasan por puertos (R4)

Rama `refactor/puertos-hacia-crm`, desde `origin/main` (v0.29.0).

## Qué cambió

- `inbox` escribía en `contactos` y `quoting` leía `contactos` y `oportunidades` con el cliente de la
  transacción. Ahora piden por puerto (`apps/api/src/shared/puertos/puertos-hacia-crm.ts`):
  `PuertoContactos.asegurarContacto` e `PuertoReferenciasDeCrm.existeContacto` /
  `existeOportunidadDelContacto`.
- **El token vive en `shared/puertos/`**, no en `inbox` ni en `quoting`: `crm` tiene que implementarlo y,
  si viviera en el cliente, `crm` importaría al cliente. Los define quien los necesita, los implementa
  `crm` (`infrastructure/puertos-de-crm.prisma.ts`) y se registran con `CrmPuertosModule`, global.
- **El tenant no cambia:** cada método recibe la `tx` del llamador, que ya trae `app.current_tenant`.
  El puerto no abre transacción ni tiene `PrismaService`.
- **`CrmPuertosModule` aparte de `CrmModule`** porque el trabajador no debe construir el controlador
  de `crm` ni nada que dependa del rol `viajapro_app`. El trabajador tiene ahora raíz propia,
  `src/worker.module.ts`, hermana de `AppModule`, que compone `CrmPuertosModule` + `InboxWorkerModule`.

## La compuerta no los veía

El job `fronteras-entre-modulos` era un `grep` de `modules/` sobre las importaciones: no veía rutas
relativas (`../crm/...`) y no veía accesos a datos, que no son importaciones. Los dos casos pasaban en
verde. `scripts/verificar-fronteras.mjs` resuelve las rutas relativas, y busca modelos de Prisma y
tablas de otro módulo (en el código, sin comentarios). Exentas las pruebas, que ensamblan procesos
reales. Probado contra el código de antes (`git archive origin/main`): **sale con 1 y marca
`bandeja.prisma.ts:37`, `cotizaciones.use-case.ts:99` y `:106`**. Con el cambio, sale con 0. Sus pruebas
(`verificar-fronteras.test.mjs`, 6 casos que reproducen el código viejo) corren en `pnpm test:hooks`.

## Verificación

- `puertos-de-crm.e2e-spec.ts` (CI): un contacto de A no existe para B; RLS manda aunque se pase el
  `tenantId` equivocado; `asegurarContacto` en B crea un contacto propio sin tocar el de A; idempotente
  y sin sobrescribir el nombre.
- Las e2e de inbox, relay y cotizaciones, sin cambios de comportamiento, se validan en CI (no se
  corrieron en local: Neon es compartido).

## A cola

- La rama `feat/inbox-barrido-pendientes` construye `BandejaPrisma` a mano en su e2e: al integrarse
  tras esta, esa línea necesita `new ContactosDeCrm()`.
- Los permisos de `asegurarContacto` siguen sin el saneo del nombre de perfil ni la marca de origen
  que pide ADR-0008 §3 (ADR-0010 punto 11): el puerto es el sitio donde ahora se puede hacer.
