# 2026-11-17 — Permisos del archivo de viaje (T-249)

**Participantes:** agente `datos`.
**Alcance:** ADR-0024 §3.7, cierre del hallazgo de la auditoría de T-242 (lectura de menores abierta
a todo miembro; cualquier asesor marcaba reservas como pagadas).

## Qué se hizo

- **Migración `20261118100000_permisos_del_archivo_de_viaje`** (ruta protegida): amplía
  `roles_permisos_del_catalogo` a diez permisos (`NOT VALID` + `VALIDATE`) y rellena agencia por
  agencia, con `app.current_tenant`, `archivo.ver` y `archivo.operar` en DUENO, ASESOR y OPERACIONES.
  Aborta si un sembrado queda sin los dos o con repetidos; al final comprueba aislamiento y que el
  CHECK quedó validado con los dos. Reversible con migración nueva (explicado en la cabecera).
- **`PERMISOS`** (contracts) y **`ROLES_SEMBRADOS`** (siembra de agencias nuevas) los incluyen.
- **`ArchivosController`:** `archivo.ver` en `GET /archivos` y `GET /archivos/:id`
  (`PERMISO_PARA_VER_ARCHIVOS`), `archivo.operar` en las tres mutaciones
  (`PERMISO_PARA_OPERAR_ARCHIVOS`). `mutaciones-con-permiso.spec.ts` fija ahora el literal
  `archivo.operar` y que las dos lecturas exigen `archivo.ver`.
- **Web:** solo lo que exige el tipo `Record<Permiso, …>`: etiquetas y explicaciones de los dos
  permisos en `apps/web/src/lib/permisos.ts`, y la constante de cada uno. Ocultar las mutaciones de
  `/viajes` sin `archivo.operar` queda en T-252: los componentes de `reservas/` no usan `usePermisos`
  y meterlo cambia los mocks de `viajes/page.spec.tsx`; no era trivial.
- **Pruebas:** `packages/database/tests/permisos-de-archivo.spec.ts` (relleno, CHECK, siembra);
  `booking-archivos.e2e-spec.ts` gana un bloque con **sesiones reales** (inicio de sesión por HTTP,
  como `miembros-asignables.e2e-spec.ts`): sin `archivo.ver` → 403 en lista y detalle; con solo
  `archivo.ver` → 200 al leer y 403 en las tres mutaciones con la base intacta; OPERACIONES opera.
  `semilla-agencia-aislamiento.spec.ts` comprueba los dos en los tres roles.

## Decisiones que conviene revisar

- **OPERACIONES deja de ser «solo lectura fuera del catálogo»**: recibe `archivo.operar`, como dice
  el ADR. Sigue sin `bandeja.operar`, `crm.escribir` y `cotizacion.escribir`; la regla de la web que
  le niega esos tres no toca los nuevos.
- **`permisos-de-mutacion.spec.ts` cambió de corte:** reejecutaba la migración de T-089 desde el
  principio, CHECK de ocho incluido; con roles reales que ya tienen `archivo.*`, el `VALIDATE`
  fallaría. Ahora ejecuta solo el relleno (desde el primer `DO $$`). La prueba nueva hace lo mismo
  para no romperse con la próxima ampliación.

## Verificación

- `pnpm --filter @viajapro/contracts build`, `prisma generate`, `pnpm typecheck` y `pnpm lint`: verdes.
- Unitarias: contracts (`identidad.spec.ts`), API (`shared/autorizacion` y `modules/booking`, 140) y
  web (`lib/permisos.spec.ts`, `app/viajes`, `components`, 409): verdes.
- **No se pudo levantar Postgres** (el sistema de permisos denegó la orden): ni `pnpm db:migrate`
  desde cero, ni las pruebas de `packages/database`, ni el e2e. Los valida el CI.

## Pendiente

- CI, aprobación del propietario (migración: ruta protegida) e integración; T-249 queda `in_progress`.
- T-252: ocultar en `/viajes` las mutaciones sin `archivo.operar`.
