import { expect, test } from './fixtures';

/**
 * Recorrido de las pantallas principales con sesion: ninguna debe producir errores de consola
 * (hidratacion incluida) ni respuestas 5xx; lo vigila el fixture `vigilante` de fixtures.ts.
 */
// `h1: true` busca el título como H1 de la página. Antes se buscaba como texto suelto visible, y casi
// todos esos títulos («Contactos», «Cotizaciones», «Reportes», «Archivos de viaje»...) son TAMBIÉN la
// etiqueta del menú lateral, siempre visible a 1440 px: la prueba pasaba aunque el contenido de la
// pantalla no hubiera pintado nada. La bandeja se queda con su texto de estado vacío, que no es una
// etiqueta del menú.
const RUTAS: Array<{ ruta: string; titulo: RegExp; h1: boolean }> = [
  { ruta: '/bandeja', titulo: /Elige una conversación/, h1: false },
  { ruta: '/contactos', titulo: /^Contactos$/, h1: true },
  { ruta: '/pipeline', titulo: /^Oportunidades$/, h1: true },
  { ruta: '/cotizador', titulo: /^Cotizador Comercial$/, h1: true },
  { ruta: '/cotizaciones', titulo: /^Cotizaciones$/, h1: true },
  { ruta: '/reportes', titulo: /^Reportes/, h1: true },
  { ruta: '/viajes', titulo: /^Archivos de viaje$/, h1: true },
];

for (const { ruta, titulo, h1 } of RUTAS) {
  test(`${ruta} carga sin errores de consola ni 5xx`, async ({ page }) => {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status()).toBeLessThan(400);
    const encabezado = h1
      ? page.getByRole('heading', { level: 1, name: titulo })
      : page.getByText(titulo).filter({ visible: true }).first();
    await expect(encabezado).toBeVisible({ timeout: 20_000 });
    // Deja correr la hidratacion y las primeras llamadas a la API antes de que el vigilante evalue.
    // No se usa `networkidle`: Socket.IO mantiene la red ocupada y nunca llegaria.
    await page.waitForTimeout(2_000);
  });
}

/**
 * Marco compartido (ADR-0032, N1): toda ruta privada con marco muestra la barra lateral en
 * escritorio y la barra inferior en móvil, con a lo sumo un `aria-current="page"` en la barra
 * visible. La barra móvil es Hoy · Conversaciones · Cotizar · Archivos de viaje · Más (T-320):
 * los módulos que viven en la hoja «Más» (Oportunidades, Cotizaciones, Seguimientos,
 * Configuración…) no tienen ítem activo en la barra. `/cotizaciones` no activa «Cotizar» (solo
 * lo hace `/cotizador`, que no se recorre aquí).
 */
// Solo rutas ligeras y representativas: el marco es una única implementación (el layout `(app)`) y
// `inventario-de-rutas.spec.ts` garantiza que toda página privada vive dentro de él; el módulo activo
// de las demás lo cubre `navegacion.spec.ts`. Recorrer también catálogo, reportes o contactos
// agotaba el límite de 300 peticiones por minuto por IP de la API del CI («Demasiadas peticiones»).
// Rutas medidas a mano a 390×844 al arreglar el doble desplazamiento; el resto del marco es el mismo.
// `/reportes` entra con T-343: su criterio de aceptacion exige 390 px sin desplazamiento lateral y
// hasta ahora no lo comprobaba nadie — ni capturas (el clasificador no deja arrancar `next dev`) ni
// esta prueba. Se mide sobre la misma carga, asi que no suma peticiones al limite de la API del CI.
const MIDE_DESPLAZAMIENTO = new Set([
  '/bandeja',
  '/seguimientos',
  '/viajes',
  '/configuracion',
  '/reportes',
]);

const RUTAS_CON_MARCO: Array<{ ruta: string; activoEscritorio: boolean; activoMovil: boolean }> = [
  { ruta: '/', activoEscritorio: true, activoMovil: true },
  { ruta: '/bandeja', activoEscritorio: true, activoMovil: true },
  { ruta: '/pipeline', activoEscritorio: true, activoMovil: false },
  { ruta: '/cotizaciones', activoEscritorio: true, activoMovil: false },
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

    if (MIDE_DESPLAZAMIENTO.has(ruta)) {
      // Un solo desplazamiento a 390×844 (T-315): el documento no se desplaza ni a lo alto (el pie legal
      // vive dentro de `main#contenido`) ni a lo ancho (un `sr-only` absoluto de la tabla de equipo
      // ensanchaba el viewport de diseño). Se mide aquí, sobre la misma carga, y no en pruebas aparte:
      // cada carga de página suma peticiones al límite de la API del CI (300 por minuto por IP).
      await page.waitForTimeout(1_000);
      const medidas = await page.evaluate(() => {
        const d = document.documentElement;
        return { alto: d.scrollHeight - d.clientHeight, ancho: d.scrollWidth - d.clientWidth };
      });
      expect(medidas.alto).toBeLessThanOrEqual(1);
      expect(medidas.ancho).toBeLessThanOrEqual(0);
      // En la bandeja (pantalla completa) no hay pie; en el resto vive dentro de la región de trabajo.
      await expect(
        page.locator('main#contenido [data-testid="pie-de-pagina-privacidad"]'),
      ).toHaveCount(ruta === '/bandeja' ? 0 : 1);
    }
  });
}
