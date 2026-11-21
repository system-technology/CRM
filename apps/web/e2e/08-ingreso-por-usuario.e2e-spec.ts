import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { RUTA_SESION } from '../playwright.config';
import { URL_API, credenciales } from './auxiliares';
import { expect, test } from './fixtures';

/**
 * Ingreso con correo o con usuario (apodo, ADR-0031) y edicion del usuario de un miembro (#358,
 * #404, #405, T-511), a 390 px y contra la API REAL.
 *
 * Lo que se demuestra: la persona dueña de la sesion fija un usuario a un miembro desde
 * Configuracion > Equipo, la pantalla lo muestra, y con ese usuario (y no con el correo) se entra;
 * el correo sigue sirviendo; y al quitarlo, el usuario deja de entrar. Todo sin desplazamiento
 * lateral.
 *
 * Nada fijo: el miembro sale de lo que devuelve la API (el de la sesion) y el usuario es unico por
 * corrida, porque el apodo es global en esta fase (T-361).
 */
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 } });

const apodo = `e2e-${randomBytes(4).toString('hex')}`;
let miembroId = '';
let miembroNombre = '';

async function sinDesborde(page: Page, donde: string): Promise<void> {
  const exceso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(exceso, `desbordamiento horizontal ${donde}`).toBeLessThanOrEqual(0);
}

/** El aviso del formulario de ingreso; Next anade otro `role=alert` (el anunciador de rutas). */
const avisoDeIngreso = (page: Page) => page.getByRole('alert').filter({ hasText: /\S/ });

/** El miembro de la sesion, tal como lo lista la API (no se supone ni su id ni su nombre). */
async function miembroDeLaSesion(page: Page): Promise<{ id: string; nombre: string }> {
  const res = await page.request.get(`${URL_API}/api/v1/identidad/miembros`);
  expect(res.status(), 'GET /api/v1/identidad/miembros').toBe(200);
  const lista = (await res.json()) as Array<{ id: string; nombre: string; correo: string }>;
  const { correo } = credenciales();
  const yo = lista.find((m) => m.correo.toLowerCase() === correo.toLowerCase());
  expect(yo, `el listado de miembros no trae a ${correo}`).toBeTruthy();
  return { id: yo!.id, nombre: yo!.nombre };
}

/** Si el dialogo no se cierra, el fallo dice POR QUE: el texto de error que esta en pantalla. */
async function guardarUsuario(page: Page, texto: string): Promise<void> {
  const dialogo = page.getByRole('dialog', { name: `Usuario de ${miembroNombre}` });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('Usuario', { exact: true }).fill(texto);
  await dialogo.getByRole('button', { name: 'Guardar', exact: true }).click();
  try {
    await expect(dialogo).toHaveCount(0, { timeout: 20_000 });
  } catch {
    const motivo = await page
      .getByTestId('error-usuario-de-ingreso')
      .innerText()
      .catch(() => '(sin mensaje en el dialogo)');
    throw new Error(`El usuario «${texto}» no se guardo. La pantalla dijo: ${motivo}`);
  }
}

async function ingresar(page: Page, identificador: string, clave: string): Promise<void> {
  await page.goto('/ingresar');
  await page.locator('#campo-identificador').fill(identificador);
  await page.locator('#campo-contrasena').fill(clave);
  await sinDesborde(page, 'en la pantalla de ingreso');
  await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();
  try {
    await expect(page).toHaveURL(/^[^?#]*\/$/, { timeout: 20_000 });
  } catch {
    const motivo = await avisoDeIngreso(page)
      .innerText({ timeout: 2_000 })
      .catch(() => '(sin alerta en pantalla)');
    throw new Error(`No se pudo ingresar con «${identificador}». La pantalla dijo: ${motivo}`);
  }
  await expect(page.locator('main#contenido')).toBeVisible();
}

test.afterAll(async ({ browser }) => {
  // Aunque una prueba falle a medias, el usuario de la corrida no se queda en la base.
  const contexto = await browser.newContext({ storageState: RUTA_SESION });
  try {
    if (miembroId) {
      await contexto.request.patch(`${URL_API}/api/v1/identidad/miembros/${miembroId}/apodo`, {
        data: { apodo: null },
      });
    }
  } finally {
    await contexto.close();
  }
});

test('se fija el usuario de un miembro en Configuracion > Equipo a 390 px', async ({ page }) => {
  ({ id: miembroId, nombre: miembroNombre } = await miembroDeLaSesion(page));

  await page.goto('/configuracion?pestana=equipo');
  const editar = page.getByRole('button', { name: `Editar usuario de ${miembroNombre}` });
  await expect(editar).toBeVisible({ timeout: 30_000 });
  const caja = await editar.boundingBox();
  expect(caja!.height, 'el boton «Usuario» es un objetivo tactil').toBeGreaterThanOrEqual(44);
  await sinDesborde(page, 'con la lista de miembros');

  await editar.click();
  await sinDesborde(page, 'con el dialogo del usuario abierto');
  await guardarUsuario(page, apodo);

  await expect(page.getByRole('status').filter({ hasText: 'ya puede entrar' })).toBeVisible();
  await expect(
    page.locator('tr', { hasText: miembroNombre }).getByTestId('usuario-de-ingreso'),
  ).toHaveText(`Usuario: ${apodo}`);
  await sinDesborde(page, 'tras guardar el usuario');

  // Al recargar sigue: lo guardo el servidor, no la pantalla.
  await page.reload();
  await expect(
    page.locator('tr', { hasText: miembroNombre }).getByTestId('usuario-de-ingreso'),
  ).toHaveText(`Usuario: ${apodo}`, { timeout: 30_000 });
});

test.describe('sin sesion', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('ingresa con el usuario, a 390 px', async ({ page }) => {
    test.skip(!miembroId, 'depende de que la prueba anterior haya fijado el usuario');
    await ingresar(page, apodo, credenciales().clave);
  });

  test('con el correo sigue entrando, a 390 px', async ({ page }) => {
    const { correo, clave } = credenciales();
    await ingresar(page, correo, clave);
  });
});

test('al quitar el usuario ya no entra con el, pero si con el correo', async ({ page }) => {
  await page.goto('/configuracion?pestana=equipo');
  await page.getByRole('button', { name: `Editar usuario de ${miembroNombre}` }).click();
  await guardarUsuario(page, '');
  await expect(
    page.locator('tr', { hasText: miembroNombre }).getByTestId('usuario-de-ingreso'),
  ).toHaveText('Sin usuario (entra con su correo)');

  const limpio = await page.context().browser()!.newContext({
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [] },
  });
  try {
    const otra = await limpio.newPage();
    await otra.goto('/ingresar');
    await otra.locator('#campo-identificador').fill(apodo);
    await otra.locator('#campo-contrasena').fill(credenciales().clave);
    await otra.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();
    await expect(
      avisoDeIngreso(otra),
      'con el usuario quitado, entrar con el debe mostrar el error de autenticacion',
    ).toContainText('Error de autenticación');
    await expect(otra).toHaveURL(/\/ingresar/);
  } finally {
    await limpio.close();
  }
});
