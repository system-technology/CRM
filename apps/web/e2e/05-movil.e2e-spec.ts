import { expect, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * Móvil a 390×844 (T-320, variante B de D4): barra inferior Hoy · Conversaciones · Cotizar ·
 * Archivos de viaje · Más, lupa fija en la cabecera, hoja «Más» con el resto de módulos y salida
 * en la conversación que no existe.
 *
 * Ligera a propósito: UNA carga completa (`/`) y el resto, navegación del propio cliente por rutas
 * ligeras (`/seguimientos`, `/viajes`, `/bandeja`). No visita catálogo, reportes ni contactos:
 * de ellos solo se comprueba que la hoja los ofrece a un toque.
 *
 * Los selectores son únicos a propósito: la barra móvil y el menú lateral comparten etiquetas, así
 * que todo se acota por `navigation`/`dialog` con nombre o por `data-testid` (el menú lateral está
 * oculto a 390 px y Playwright no lo resuelve, pero no se confía solo en eso).
 */
test.use({ viewport: { width: 390, height: 844 } });

const barraInferior = (page: Page) =>
  page.getByRole('navigation', { name: 'Navegación móvil inferior' });
const hojaMas = (page: Page) => page.getByRole('dialog', { name: 'Más opciones' });

async function medida(elemento: Locator): Promise<{ ancho: number; alto: number }> {
  const caja = await elemento.boundingBox();
  expect(caja, 'el elemento debe estar visible para medirlo').not.toBeNull();
  return { ancho: caja?.width ?? 0, alto: caja?.height ?? 0 };
}

async function esObjetivoTactil(elemento: Locator): Promise<void> {
  const { ancho, alto } = await medida(elemento);
  expect(ancho).toBeGreaterThanOrEqual(44);
  expect(alto).toBeGreaterThanOrEqual(44);
}

test('la barra inferior tiene los 5 sitios, de 44 px o más, y la lupa vive en la cabecera', async ({
  page,
}) => {
  await page.goto('/');
  const barra = barraInferior(page);
  await expect(barra).toBeVisible({ timeout: 20_000 });

  await expect(barra.locator('a, button')).toHaveCount(5);
  const hoy = barra.getByRole('link', { name: /^Hoy/ });
  const conversaciones = barra.getByRole('link', { name: 'Conversaciones', exact: true });
  const cotizar = barra.getByRole('link', { name: 'Cotizar', exact: true });
  const archivos = barra.getByRole('link', { name: 'Archivos de viaje', exact: true });
  const mas = barra.getByRole('button', { name: 'Más', exact: true });
  for (const sitio of [hoy, conversaciones, cotizar, archivos, mas]) {
    await expect(sitio).toBeVisible();
    await esObjetivoTactil(sitio);
  }
  await expect(cotizar).toHaveAttribute('href', '/cotizador');
  await expect(hoy).toHaveAttribute('aria-current', 'page');

  // Buscar y Perfil ya no ocupan pestaña.
  await expect(barra.getByRole('button', { name: 'Buscar' })).toHaveCount(0);

  // La lupa está en la cabecera del marco (fuera de la barra), una sola vez.
  const lupa = page.getByTestId('lupa-movil');
  await expect(lupa).toHaveCount(1);
  await expect(lupa).toBeVisible();
  await esObjetivoTactil(lupa);

  // Un solo desplazamiento: el documento no se mueve ni a lo ancho ni a lo alto.
  const medidas = await page.evaluate(() => {
    const d = document.documentElement;
    return { alto: d.scrollHeight - d.clientHeight, ancho: d.scrollWidth - d.clientWidth };
  });
  expect(medidas.alto).toBeLessThanOrEqual(1);
  expect(medidas.ancho).toBeLessThanOrEqual(0);
});

test('la lupa abre la búsqueda existente y Esc la cierra', async ({ page }) => {
  await page.goto('/');
  const lupa = page.getByTestId('lupa-movil');
  await expect(lupa).toBeVisible({ timeout: 20_000 });

  await lupa.click();
  const paleta = page.getByRole('dialog', { name: /Paleta de Comandos/ });
  await expect(paleta).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paleta).toBeHidden();
});

test('«Más» abre la hoja con los demás módulos, cada uno a dos toques o menos', async ({
  page,
}) => {
  await page.goto('/');
  await expect(barraInferior(page)).toBeVisible({ timeout: 20_000 });

  // Toque 1: «Más». Toque 2 (no se pulsa aquí salvo uno ligero): el módulo de la hoja.
  await barraInferior(page).getByRole('button', { name: 'Más', exact: true }).click();
  const hoja = hojaMas(page);
  await expect(hoja).toBeVisible();

  const modulos: Array<{ id: string; ruta: string }> = [
    { id: 'oportunidades', ruta: '/pipeline' },
    { id: 'cotizaciones', ruta: '/cotizaciones' },
    { id: 'seguimientos', ruta: '/seguimientos' },
    { id: 'contactos', ruta: '/contactos' },
    { id: 'catalogo', ruta: '/catalogo' },
    { id: 'reportes', ruta: '/reportes' },
    { id: 'configuracion', ruta: '/configuracion' },
  ];
  for (const { id, ruta } of modulos) {
    const enlace = hoja.getByTestId(`mas-modulo-${id}`);
    await expect(enlace).toBeVisible();
    await expect(enlace).toHaveAttribute('href', ruta);
    await esObjetivoTactil(enlace);
  }

  // Campana, perfil y enlaces legales, todos con objetivo táctil.
  await esObjetivoTactil(hoja.getByTestId('mas-notificaciones'));
  await esObjetivoTactil(hoja.getByTestId('boton-perfil-movil'));
  for (const legal of ['privacidad', 'terminos', 'cookies']) {
    await esObjetivoTactil(hoja.getByTestId(`mas-legal-${legal}`));
  }
  await esObjetivoTactil(hoja.getByTestId('hoja-mas-cerrar'));

  // Ningún módulo de la hoja repite uno de la barra.
  await expect(hoja.getByTestId('mas-modulo-hoy')).toHaveCount(0);
  await expect(hoja.getByTestId('mas-modulo-conversaciones')).toHaveCount(0);

  // Dos toques de verdad hasta Seguimientos (ruta ligera) y la hoja se cierra al navegar.
  await hoja.getByTestId('mas-modulo-seguimientos').click();
  await expect(page).toHaveURL(/\/seguimientos$/);
  await expect(hojaMas(page)).toHaveCount(0);

  // Desde ahí, un toque a Archivos de viaje y otro a Conversaciones, por la barra.
  const barra = barraInferior(page);
  await barra.getByRole('link', { name: 'Archivos de viaje', exact: true }).click();
  await expect(page).toHaveURL(/\/viajes$/);
  await expect(barra.getByRole('link', { name: 'Archivos de viaje', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await barra.getByRole('link', { name: 'Conversaciones', exact: true }).click();
  await expect(page).toHaveURL(/\/bandeja$/);
});

test('/bandeja/inexistente tiene salida: flecha de volver de 44 px, sin barra inferior ni lupa', async ({
  page,
}) => {
  // El estado de error de la conversación vuelca el error crudo a `console.error` por diseño
  // (estados-ui-logica, 0c.30) y el vigilante lo contaría como defecto de la página: se silencia
  // solo esa línea, no el resto de la consola.
  await page.addInitScript(() => {
    const original = console.error.bind(console);
    console.error = (...argumentos: unknown[]) => {
      if (String(argumentos[0]).startsWith('[ErrorSistema')) return;
      original(...argumentos);
    };
  });
  await page.goto('/bandeja/inexistente');
  const volver = page.getByTestId('volver-a-conversaciones');
  await expect(volver).toBeVisible({ timeout: 20_000 });
  await esObjetivoTactil(volver);
  await expect(barraInferior(page)).toHaveCount(0);
  await expect(page.getByTestId('lupa-movil')).toHaveCount(0);

  await volver.click();
  await expect(page).toHaveURL(/\/bandeja$/);
  await expect(barraInferior(page)).toBeVisible();
});
