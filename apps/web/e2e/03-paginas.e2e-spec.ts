import { expect, test } from './fixtures';

/**
 * Recorrido de las pantallas principales con sesion: ninguna debe producir errores de consola
 * (hidratacion incluida) ni respuestas 5xx; lo vigila el fixture `vigilante` de fixtures.ts.
 */
const RUTAS: Array<{ ruta: string; titulo: RegExp }> = [
  { ruta: '/bandeja', titulo: /Elige una conversación|Lista de conversaciones/ },
  { ruta: '/contactos', titulo: /Contactos/ },
  { ruta: '/pipeline', titulo: /Pipeline de Oportunidades/ },
  { ruta: '/cotizador', titulo: /Cotizador Comercial/ },
  { ruta: '/cotizaciones', titulo: /Directorio de Cotizaciones/ },
  { ruta: '/reportes', titulo: /Reportes y Rendimiento Comercial/ },
  { ruta: '/viajes', titulo: /Reservas/ },
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
 * visible. «Hoy», «Seguimientos» y «Cotizaciones» aún no son ítems del menú (T-317), así que en
 * esas rutas no hay ninguno activo; la barra móvil solo tiene los 4 módulos principales.
 */
// Solo rutas ligeras y representativas: el marco es una única implementación (el layout `(app)`) y
// `inventario-de-rutas.spec.ts` garantiza que toda página privada vive dentro de él; el módulo activo
// de las demás lo cubre `modulo-activo.spec.ts`. Recorrer también catálogo, reportes o contactos
// agotaba el límite de 300 peticiones por minuto por IP de la API del CI («Demasiadas peticiones»).
const RUTAS_CON_MARCO: Array<{ ruta: string; activoEscritorio: boolean; activoMovil: boolean }> = [
  { ruta: '/', activoEscritorio: false, activoMovil: false },
  { ruta: '/bandeja', activoEscritorio: true, activoMovil: true },
  { ruta: '/pipeline', activoEscritorio: true, activoMovil: true },
  { ruta: '/cotizaciones', activoEscritorio: false, activoMovil: false },
  { ruta: '/viajes', activoEscritorio: true, activoMovil: true },
  { ruta: '/seguimientos', activoEscritorio: false, activoMovil: false },
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

/**
 * Un solo desplazamiento a 390×844 (T-315): el documento no se desplaza ni a lo alto (el pie legal
 * vive dentro de `main#contenido`) ni a lo ancho (un `sr-only` absoluto de la tabla de equipo
 * ensanchaba el viewport de diseño). Solo rutas ligeras, por el límite de la API del CI.
 */
for (const ruta of ['/seguimientos', '/viajes', '/configuracion']) {
  test(`${ruta} a 390×844 no desplaza el documento`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ruta);
    await expect(page.locator('main#contenido')).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const medidas = await page.evaluate(() => {
      const d = document.documentElement;
      return { alto: d.scrollHeight - d.clientHeight, ancho: d.scrollWidth - d.clientWidth };
    });
    expect(medidas.alto).toBeLessThanOrEqual(1);
    expect(medidas.ancho).toBeLessThanOrEqual(0);
    // El pie sigue existiendo (dentro de la región de trabajo); el del layout raíz queda oculto.
    await expect(
      page.locator('main#contenido [data-testid="pie-de-pagina-privacidad"]'),
    ).toHaveCount(1);
  });
}
