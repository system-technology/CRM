import { defineConfig } from 'vitest/config';

/**
 * Los archivos de prueba de este paquete comparten UNA base de datos real. La prueba 22 de
 * `aislamiento.spec.ts` reaplica las políticas (GRANT/REVOKE/CREATE POLICY: AccessExclusiveLock
 * sobre las tablas) mientras otro archivo consulta esas mismas tablas (AccessShareLock): Postgres
 * aborta a una con 40P01. Se ejecutan los archivos de uno en uno; dentro de cada archivo el orden
 * ya era secuencial. Sin reintentos: serializar es la exclusión mutua que faltaba.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
