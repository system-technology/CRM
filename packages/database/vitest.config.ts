import { defineConfig } from 'vitest/config';

/**
 * Los archivos de prueba de este paquete comparten UNA base de datos real. La prueba 22 de
 * `aislamiento.spec.ts` reaplica las políticas (GRANT/REVOKE/CREATE POLICY: AccessExclusiveLock
 * sobre las tablas) mientras otro archivo consulta esas mismas tablas (AccessShareLock): Postgres
 * aborta a una con 40P01. Se ejecutan los archivos de uno en uno; dentro de cada archivo el orden
 * ya era secuencial. Sin reintentos: serializar es la exclusión mutua que faltaba.
 *
 * Esto solo serializa DENTRO de este paquete. `apps/api` comparte la misma base: si sus e2e corren a
 * la vez, crean y borran agencias mientras los rellenos de migración de aquí recorren todas
 * (`etiquetas_tenant_id_fkey`, 40P01; T-503). Por eso `apps/api/turbo.json` hace que sus pruebas
 * esperen a las de este paquete: no quites esa dependencia sin darle a cada paquete su propia base.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
