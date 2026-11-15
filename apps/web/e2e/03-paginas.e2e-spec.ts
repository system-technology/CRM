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
