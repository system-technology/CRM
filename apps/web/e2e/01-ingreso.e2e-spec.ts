import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { RUTA_SESION } from '../playwright.config';
import { credenciales } from './auxiliares';
import { expect, test } from './fixtures';

/** H1: ingresar con un usuario sembrado y caer en «Hoy» (T-317). Deja la sesion para el resto. */

test.describe('sin sesion', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('la pantalla de ingreso es la de la API real, no la maqueta', async ({ page }) => {
    await page.goto('/ingresar');
    await expect(page.getByText('Modo de Producción (API Real)')).toBeVisible();
    await expect(page.locator('#campo-correo')).toBeVisible();
  });

  test('una ruta protegida sin sesion lleva a /ingresar y no muestra datos', async ({ page }) => {
    await page.goto('/bandeja');
    await expect(page).toHaveURL(/\/ingresar/, { timeout: 20_000 });
    await expect(page.getByRole('region', { name: 'Lista de conversaciones' })).toHaveCount(0);
  });

  test('una clave equivocada muestra el error y no abre sesion', async ({ page }) => {
    const { correo } = credenciales();
    await page.goto('/ingresar');
    await page.locator('#campo-correo').fill(correo);
    await page.locator('#campo-contrasena').fill('clave-equivocada-0000');
    await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();
    await expect(page.getByText('Error de autenticación')).toBeVisible();
    await expect(page).toHaveURL(/\/ingresar/);
  });
});

test('ingresa con el usuario sembrado y cae en Hoy', async ({ page }) => {
  const { correo, clave } = credenciales();
  await page.goto('/ingresar');
  await page.locator('#campo-correo').fill(correo);
  await page.locator('#campo-contrasena').fill(clave);
  await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();

  // Destino por defecto tras ingresar (D1): Hoy, en `/`, no la bandeja.
  await expect(page).toHaveURL(/^[^?#]*\/$/, { timeout: 20_000 });
  await expect(
    page.getByTestId('sidebar-escritorio').or(page.locator('main#contenido')),
  ).toBeVisible();

  // Como la asesora la primera vez: el banner de cookies queda fijo abajo y tapa el compositor de la
  // bandeja hasta que se acepta. El consentimiento se guarda en el navegador y viaja en la sesion.
  const banner = page.getByTestId('banner-consentimiento-cookies');
  await expect(banner).toBeVisible();
  await banner.getByRole('button', { name: 'Aceptar todas' }).click();
  await expect(banner).toHaveCount(0);

  mkdirSync(path.dirname(RUTA_SESION), { recursive: true });
  await page.context().storageState({ path: RUTA_SESION });
});
