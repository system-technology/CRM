import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Primera prueba que ejercita la WEB contra la API REAL (T-196, A15 de la auditoria 2026-11-15).
 *
 * Asume API (:3333) y web (:3000) ya levantadas, con Postgres migrado y sembrado (agencia demo,
 * identidades con clave de desarrollo y canal de WhatsApp de prueba). No levanta nada: ver
 * `pnpm --filter @viajapro/web test:e2e:navegador` y el job `navegador` de .github/workflows/ci.yml.
 *
 * Los archivos se llaman `*.e2e-spec.ts` a proposito: Vitest solo recoge `*.spec.ts`/`*.test.ts`,
 * asi que `pnpm test` nunca los ejecuta por error.
 *
 * Variables (ninguna tiene valor por omision para secretos):
 *   E2E_WEB_URL            http://localhost:3000
 *   E2E_API_URL            http://localhost:3333
 *   E2E_CORREO             dueno@agenciademo.test
 *   E2E_CLAVE              (o IDENTIDAD_DEV_PASSWORD) clave de desarrollo de esa identidad
 *   META_APP_SECRET        el mismo que usa la API: firma el webhook como lo firma Meta
 *   META_PHONE_NUMBER_ID_PRUEBA  numero ligado a la agencia demo (canal:registrar-prueba)
 *   E2E_TRACE              off (por omision) | retain-on-failure
 */
export const RUTA_SESION = path.resolve(__dirname, 'e2e/.auth/sesion.json');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e-spec.ts',
  // Un flujo de negocio en serie sobre una sola base: en paralelo se pisarian los datos.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env['CI'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env['CI']
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: process.env['E2E_WEB_URL'] ?? 'http://localhost:3000',
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    viewport: { width: 1440, height: 900 },
    trace: (process.env['E2E_TRACE'] as 'off' | 'retain-on-failure' | undefined) ?? 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'ingreso',
      testMatch: '**/01-ingreso.e2e-spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      // Depende de `ingreso`: si no se puede ingresar, el resto no corre (y se ve por que).
      name: 'flujo',
      testMatch: [
        '**/02-flujo-h1-h6.e2e-spec.ts',
        '**/03-paginas.e2e-spec.ts',
        '**/04-nombres.e2e-spec.ts',
        '**/05-movil.e2e-spec.ts',
        '**/06-etiquetas.e2e-spec.ts',
      ],
      dependencies: ['ingreso'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: RUTA_SESION,
      },
    },
  ],
});
