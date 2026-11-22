import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { RUTA_SESION } from '../playwright.config';
import { credenciales } from './auxiliares';
import { expect, test } from './fixtures';

/** H1: ingresar con un usuario sembrado y caer en «Hoy» (T-317). Deja la sesion para el resto. */

test.describe('sin sesion', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('la pantalla de ingreso es la real, no la demostración', async ({ page }) => {
    await page.goto('/ingresar');
    // T-565: el cartel de demostración solo sale en la maqueta; el ingreso real no afirma nada.
    await expect(page.getByTestId('cartel-de-modo')).toHaveCount(0);
    await expect(page.locator('#campo-identificador')).toBeVisible();
  });

  test('una ruta protegida sin sesion lleva a /ingresar y no muestra datos', async ({ page }) => {
    await page.goto('/bandeja');
    await expect(page).toHaveURL(/\/ingresar/, { timeout: 20_000 });
    await expect(page.getByRole('region', { name: 'Lista de conversaciones' })).toHaveCount(0);
  });

  test('una clave equivocada muestra el error y no abre sesion', async ({ page }) => {
    const { correo } = credenciales();
    await page.goto('/ingresar');
    await page.locator('#campo-identificador').fill(correo);
    await page.locator('#campo-contrasena').fill('clave-equivocada-0000');
    await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();
    await expect(page.getByText('Error de autenticación')).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
  });

  test('el limitador por IP (429) dice que basta esperar y no se hace pasar por clave mala', async ({
    page,
  }) => {
    // Respuesta fabricada en el navegador: no gasta cupo del limitador real (5 por minuto por IP),
    // que comparten las demás pruebas del job.
    await page.route('**/api/v1/auth/sign-in/email', (ruta) =>
      ruta.fulfill({ status: 429, contentType: 'application/json', body: '{}' }),
    );
    const { correo } = credenciales();
    await page.goto('/ingresar');
    await page.locator('#campo-identificador').fill(correo);
    await page.locator('#campo-contrasena').fill('cualquier-clave-0000');
    await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();

    const aviso = page.getByTestId('aviso-limite-de-intentos');
    await expect(aviso).toBeVisible();
    await expect(aviso).toHaveAttribute('role', 'alert');
    await expect(aviso).toContainText('Demasiados intentos seguidos');
    await expect(aviso).toContainText('Espera un minuto');
    // Ni el título ni el texto del rechazo de credenciales: ese dice otra cosa.
    await expect(page.getByText('Error de autenticación')).toHaveCount(0);
    await expect(page.getByText('Los datos no coinciden')).toHaveCount(0);
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test('ingresa con el usuario sembrado y cae en Hoy', async ({ page }) => {
  const { correo, clave } = credenciales();
  await page.goto('/ingresar');
  await page.locator('#campo-identificador').fill(correo);
  await page.locator('#campo-contrasena').fill(clave);
  await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();

  // Destino por defecto tras ingresar (D1): Hoy, en `/`, no la bandeja.
  await expect(page).toHaveURL(/^[^?#]*\/$/, { timeout: 20_000 });
  await expect(page.locator('main#contenido')).toBeVisible();

  // Como la asesora la primera vez: el banner de cookies queda fijo abajo y tapa el compositor de la
  // bandeja hasta que se acepta. El consentimiento se guarda en el navegador y viaja en la sesion.
  const banner = page.getByTestId('banner-consentimiento-cookies');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Aceptar todas' }).click();
  await expect(banner).toHaveCount(0);

  mkdirSync(path.dirname(RUTA_SESION), { recursive: true });
  await page.context().storageState({ path: RUTA_SESION });
});
