import { expect, test } from './fixtures';

/**
 * Recorrido de las pantallas principales con sesion: ninguna debe producir errores de consola
 * (hidratacion incluida) ni respuestas 5xx; lo vigila el fixture `vigilante` de fixtures.ts.
 */
const RUTAS: Array<{ ruta: string; titulo: RegExp }> = [
  { ruta: '/bandeja', titulo: /Elige una conversación|Lista de conversaciones/ },
  { ruta: '/contactos', titulo: /Contactos/ },
  { ruta: '/pipeline', titulo: /Oportunidades/ },
  { ruta: '/cotizador', titulo: /Cotizador Comercial/ },
  { ruta: '/cotizaciones', titulo: /Cotizaciones/ },
  { ruta: '/reportes', titulo: /Reportes/ },
  { ruta: '/viajes', titulo: /Archivos de viaje/ },
];

for (const { ruta, titulo } of RUTAS) {
  test(`${ruta} carga sin errores de consola ni 5xx`, async ({ page }) => {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status()).toBeLessThan(400);
    await expect(page.getByText(titulo).first()).toBeVisible({ timeout: 20_000 });
    // Deja correr la hidratacion y las primeras llamadas a la API antes de que el vigilante evalue.
    // No se usa `networkidle`: Socket.IO mantiene la red ocupada y nunca llegaria.
    await page.waitForTimeout(2_000);
  });
}

/**
 * Marco compartido (ADR-0032, N1): toda ruta privada con marco muestra la barra lateral en
 * escritorio y la barra inferior en móvil, con a lo sumo un `aria-current="page"` en la barra
 * visible. «Hoy» y «Seguimientos» ya son ítems del menú lateral (T-317); la barra móvil solo tiene
 * 4 módulos (su composición es T-320), así que en móvil Seguimientos no tiene ítem activo.
 */
// Solo rutas ligeras y representativas: el marco es una única implementación (el layout `(app)`) y
// `inventario-de-rutas.spec.ts` garantiza que toda página privada vive dentro de él; el módulo activo
// de las demás lo cubre `navegacion.spec.ts`. Recorrer también catálogo, reportes o contactos
// agotaba el límite de 300 peticiones por minuto por IP de la API del CI («Demasiadas peticiones»).
const RUTAS_CON_MARCO: Array<{ ruta: string; activoEscritorio: boolean; activoMovil: boolean }> = [
  { ruta: '/', activoEscritorio: true, activoMovil: false },
  { ruta: '/bandeja', activoEscritorio: true, activoMovil: true },
  { ruta: '/pipeline', activoEscritorio: true, activoMovil: true },
  { ruta: '/cotizaciones', activoEscritorio: true, activoMovil: true },
  { ruta: '/viajes', activoEscritorio: true, activoMovil: true },
  { ruta: '/seguimientos', activoEscritorio: true, activoMovil: false },
  { ruta: '/configuracion', activoEscritorio: true, activoMovil: false },
];

for (const { ruta, activoEscritorio, activoMovil } of RUTAS_CON_MARCO) {
  test(`${ruta} tiene marco: barra lateral a 1440 y barra inferior a 390`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(ruta);
    const lateral = page.getByTestId('sidebar-escritorio');
    const inferior = page.getByRole('navigation', { name: 'Navegación móvil inferior' });
    await expect(lateral).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('main#contenido')).toHaveCount(1);
    await expect(lateral.locator('[aria-current="page"]')).toHaveCount(activoEscritorio ? 1 : 0);
    await expect(inferior).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(inferior).toBeVisible();
    await expect(lateral).toBeHidden();
    await expect(inferior.locator('[aria-current="page"]')).toHaveCount(activoMovil ? 1 : 0);
  });
}
