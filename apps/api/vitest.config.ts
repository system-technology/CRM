/**
 * Configuración de pruebas de `apps/api`.
 *
 * Existe por una razón concreta: la convención del proyecto nombra las pruebas de integración
 * `*.e2e-spec.ts` —con guion— y el patrón por defecto de vitest solo recoge `*.spec.ts`. La
 * primera prueba que arranca la aplicación ensamblada **no se estaba ejecutando** y el informe
 * decía «103 passed» igual. Una prueba que no corre es peor que una que falta: la que falta se
 * ve.
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts'],
    setupFiles: ['./src/vitest.setup.ts'],
    // Sin Redis en las pruebas: la cola se declara inerte. El encolado se prueba con un doble.
    env: { COLA_CHANGES: 'inerte', COLA_CORREO: 'memoria', MAIL_PROVIDER: 'memoria' },
    // Arrancar Nest y conectar con Neon no son milisegundos.
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
