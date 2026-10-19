# Entrega — Tarea 0c.22b: `TipoPasajero` sale del contrato, no de un mock — 2026-10-19

## Qué construí

1. **Eliminación de la redefinición de `TipoPasajero` (R3):**
   - En `apps/web/src/lib/mock-viajes.ts`, se eliminó la declaración local `export type TipoPasajero = 'ADT' | 'CHD' | 'INF';`.
   - Se reemplazó por la importación directa del tipo desde los contratos del monorepo: `import type { TipoPasajero } from '@viajapro/contracts';`.
   - Los valores coinciden exactamente (`'ADT' | 'CHD' | 'INF'`) con el esquema Zod y tipo exportados en `packages/contracts/src/comunes.ts` y re-exportados por `@viajapro/contracts`.

2. **Auditoría exhaustiva contra R3 en todos los archivos `mock-*.ts` y en `apps/web/src/`:**
   - Se ejecutó un script de verificación cruzando todos los nombres exportados por `@viajapro/contracts` contra cada `export type` y `export interface` en `apps/web/src/lib/mock-*.ts` y en la totalidad de `apps/web/src/`.
   - Resultado: **0 colisiones adicionales**.
   - Los demás tipos presentes en `mock-*.ts` (`RolMiembro`, `EstadoMiembro`, `CalidadWaba`, `EstadoConexionWaba`, `ConfiguracionWaba`, `ConfiguracionSla`, `ConfiguracionAgencia`, `EtapaConfigurada`, `RangoPeriodo`, `RolVistaReporte`, `VentaPorDestino`, `EtapaConversion`, `RendimientoAsesor`, `ReporteComercial`, `EstadoArchivoViaje`, `EstadoDocumento`, `TipoServicioBooking`, `EstadoBooking`, `MetodoPago`) son tipos exclusivos de maquetas UI previas a sus respectivos ADRs y no existen en los contratos.

3. **Sincronización con `origin/main`:**
   - Se realizó merge limpio de `origin/main` (v0.24.0, integración de la tanda 1 de la bandeja web).

---

## Qué verifiqué EJECUTANDO

1. **Verificación de criterio de aceptación:**
   - La orden de auditoría sobre `mock-*.ts`:
     ```
     node script auditando contractNames.has(typeName)
     ```
     Arrojó:
     - `mock-configuracion.ts`: RolMiembro, EstadoMiembro, CalidadWaba, EstadoConexionWaba (mock-only: OK)
     - `mock-reportes.ts`: RangoPeriodo, RolVistaReporte (mock-only: OK)
     - `mock-viajes.ts`: EstadoArchivoViaje, EstadoDocumento, TipoServicioBooking, EstadoBooking, MetodoPago (mock-only: OK)
     - **0 tipos de contrato redefinidos en mock-*.ts**.

2. **Compuertas estáticas y de frontend:**
   - `build`: **5/5 paquetes en verde** (Next.js 15.5.27 compiló 13/13 rutas en 5.3s).
   - `lint`: **7/7 paquetes en verde** (0 errores, 0 advertencias).
   - `typecheck`: **9/9 paquetes en verde** (0 errores TypeScript).
   - `format:check`: **limpio** (100% Prettier alineado).
   - `apps/web test`: **18/18 suites en verde, 142/142 pruebas pasadas**.
   - `packages/contracts test`: **4/4 suites en verde, 60/60 pruebas pasadas**.
   - `packages/domain test`: **4/4 suites en verde, 70/70 pruebas pasadas**.
   - `apps/api test`: **23/23 suites y 279 pruebas pasadas** (con `DATABASE_URL` del entorno local limpio; `inbox-relay.e2e-spec.ts` pasó 7/7).

3. **Salida real de `pnpm compuertas` (ROJO honesto en base de datos):**
   - Cayó en `test` (`@viajapro/database`):
     - `tests/aislamiento.spec.ts:718:7` (Aserción 11): la tabla `excepciones_rls` en la base compartida Neon tiene filas para `identidades`, `sesiones` y `verificaciones` creadas para el rol `viajapro_identidad` (migración del ADR-0011 aplicada en Neon), las cuales aún no están en `EXCEPCIONES_DECLARADAS` en `packages/database/tests/aislamiento.spec.ts` de `main` ni de esta rama.
     - `tests/aislamiento.spec.ts:1890:5` (Aserción 39): conflicto en la base Neon compartida durante la corrida concurrente.
   - Conforme a las reglas R11 y contrato de traspaso, no se alteró `packages/database` (es responsabilidad de la rama de backend/Claude).

---

## Qué NO verifiqué

- No se modificó la lista `EXCEPCIONES_DECLARADAS` en `packages/database/tests/aislamiento.spec.ts` porque pertenece a la base de datos y al backend (ADR-0011).

---

## Decisiones que el encargo no especificaba

- **Importación directa en lugar de re-exportación:** En `mock-viajes.ts` se utilizó `import type { TipoPasajero } from '@viajapro/contracts';` sin volver a exportarlo (`export type TipoPasajero`), ya que los consumidores (`ficha-detalle-paquete.tsx`, `catalogo-logica.ts`) ya importan el tipo directamente de `@viajapro/contracts`. Esto garantiza que `grep -rn "export type" apps/web/src/lib/mock-*.ts` devuelva 0 coincidencias de tipos de contrato.
