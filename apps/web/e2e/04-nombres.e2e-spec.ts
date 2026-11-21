import { expect, test } from './fixtures';

/**
 * Nombres desde la tabla única (ADR-0032 §3): el título de la pestaña y el H1 de cada pantalla de
 * primer nivel salen de la etiqueta de `lib/navegacion.ts`. Las etiquetas van literales a propósito:
 * si alguien cambia la tabla, esta prueba obliga a hacerlo a conciencia.
 *
 * Solo rutas ligeras y en un único archivo: la API del CI limita a 300 peticiones por minuto por IP
 * y recorrer contactos, catálogo o reportes ya la agotó («Demasiadas peticiones»).
 */
const RUTAS: Array<{ ruta: string; etiqueta: string }> = [
  { ruta: '/bandeja', etiqueta: 'Conversaciones' },
  { ruta: '/pipeline', etiqueta: 'Oportunidades' },
  { ruta: '/cotizaciones', etiqueta: 'Cotizaciones' },
  { ruta: '/viajes', etiqueta: 'Archivos de viaje' },
  { ruta: '/seguimientos', etiqueta: 'Seguimientos' },
];

for (const { ruta, etiqueta } of RUTAS) {
  test(`${ruta}: pestaña «${etiqueta} · ViajaPro» y H1 «${etiqueta}»`, async ({ page }) => {
    await page.goto(ruta);
    await expect(page.getByRole('heading', { level: 1, name: etiqueta, exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page).toHaveTitle(`${etiqueta} · ViajaPro`);
  });
}

/**
 * T-317: «Hoy», «Cotizaciones» y «Seguimientos» están en el menú lateral, a un clic desde `/`. Solo
 * rutas ligeras (ver arriba el límite de la API).
 */
test('desde Hoy se llega a Seguimientos y a Cotizaciones en un clic desde el menú', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const lateral = page.getByTestId('sidebar-escritorio');
  await expect(lateral).toBeVisible({ timeout: 20_000 });
  await expect(lateral.getByRole('link', { name: /^Hoy/ })).toHaveAttribute('aria-current', 'page');

  await lateral.getByRole('link', { name: /^Seguimientos/ }).click();
  await expect(page).toHaveURL(/\/seguimientos$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Seguimientos', exact: true }),
  ).toBeVisible();

  await lateral.getByRole('link', { name: 'Cotizaciones', exact: true }).click();
  await expect(page).toHaveURL(/\/cotizaciones$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Cotizaciones', exact: true }),
  ).toBeVisible();
});
