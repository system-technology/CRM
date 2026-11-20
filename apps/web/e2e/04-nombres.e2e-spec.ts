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
