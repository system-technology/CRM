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
    env: {
      COLA_CHANGES: 'inerte',
      COLA_CORREO: 'memoria',
      MAIL_PROVIDER: 'memoria',
      BUS_DE_EVENTOS: 'memoria',
      LIMITADOR_OTP: 'memoria',
      // Las e2e piden muchos códigos para un mismo buzón; la prueba del límite lo baja a propósito.
      OTP_ENVIOS_POR_CORREO: '1000',
      OTP_ENVIOS_POR_IP: '1000',
      // El límite de tasa general no debe estorbar a las e2e (muchas peticiones desde una IP); su e2e lo baja.
      LIMITE_TASA_ALMACEN: 'memoria',
      LIMITE_TASA_POR_IP: '100000',
      LIMITE_TASA_POR_TENANT: '100000',
    },
    // Arrancar Nest y conectar con Neon no son milisegundos.
    testTimeout: 60_000,
    hookTimeout: 90_000,
  },
});
