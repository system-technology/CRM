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
    // Los archivos e2e corren en paralelo (el modo de siempre) contra UNA base. Se probo la ejecucion en
    // serie (#415) y se retira (T-510): el unico 40P01 con log del servidor en el CI cruzaba un
    // `TRUNCATE ... CASCADE` de packages/database con el borrado de agencias de la api, es decir, dos
    // PAQUETES, y eso ya lo impide `apps/api/turbo.json` (la api espera a la base). Entre archivos de la
    // propia api no se encontro DDL ni bloqueo de tabla, salvo un `TRUNCATE reserva_cambios_estado`
    // rechazado por privilegios en booking-archivos.e2e-spec.ts (toma el bloqueo antes de comprobar
    // permisos, un instante y sin CASCADE): es el unico candidato, y no hay un log que lo acuse. Si vuelve
    // un 40P01 o una FK ausente DENTRO de apps/api, capturar `pg_locks` y el log del servidor antes de
    // volver a poner `fileParallelism: false`: sin ese dato seria otra suposicion.
    include: ['src/**/*.spec.ts', 'src/**/*.e2e-spec.ts'],
    setupFiles: ['./src/vitest.setup.ts'],
    // Sin Redis en las pruebas: la cola se declara inerte. El encolado se prueba con un doble.
    env: {
      COLA_CHANGES: 'inerte',
      COLA_CORREO: 'memoria',
      MAIL_PROVIDER: 'memoria',
      BUS_DE_EVENTOS: 'memoria',
      LIMITADOR_OTP: 'memoria',
      // La vigilancia de plazos no corre sola contra la base compartida de las e2e (marcaría reservas
      // de fixtures ajenos); su e2e llama al caso de uso a mano.
      PLAZOS_VIGILANCIA: 'inerte',
      // El barrido del despacho de eventos tampoco: cada archivo e2e levanta su app sobre la misma base,
      // y su barrido entregaría eventos de fixtures de otro archivo (contaba intentos ajenos). El aviso
      // en memoria sigue activo y solo toca la agencia de quien hizo la petición.
      DESPACHO_BARRIDO: 'inerte',
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
