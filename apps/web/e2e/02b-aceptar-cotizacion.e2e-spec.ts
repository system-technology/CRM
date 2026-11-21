import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { URL_API } from './auxiliares';

/**
 * Aceptar una cotizacion DESDE LA PANTALLA (T-563), contra la API REAL y a 390 px.
 *
 * Lo que se demuestra es justo lo que hasta hoy solo se podia por API: la asesora abre el detalle
 * de una cotizacion enviada, pulsa «El viajero acepto», confirma lo que va a pasar, y desde ahi
 * llega al archivo de viaje que nacio de esa aceptacion.
 *
 * El archivo NO lo crea la respuesta de la aceptacion: lo abre el consumidor del evento
 * `cotizacion.aceptada` (ADR-0024 §1). Por eso la prueba espera a que aparezca —igual que la
 * pantalla— en vez de darlo por hecho.
 *
 * El montaje (dejar una cotizacion en ENVIADA) sí se hace por API a proposito: lo que se prueba es
 * la aceptacion, no volver a recorrer el cotizador, que ya cubre 02-flujo-h1-h6.
 */
test.describe.configure({ mode: 'serial' });

// El CRM se usa desde el celular: la venta se cierra en la mano, no en el escritorio.
test.use({ viewport: { width: 390, height: 844 } });

let cotizacionId = '';

async function json(page: Page, ruta: string): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${URL_API}${ruta}`);
  expect(res.status(), `GET ${ruta}`).toBeLessThan(400);
  return (await res.json()) as Record<string, unknown>;
}

test('montaje: deja una cotizacion en ENVIADA, que es la unica que se puede aceptar', async ({
  page,
}) => {
  const lista = (await json(page, '/api/v1/cotizaciones?limite=25')) as {
    datos: Array<{ id: string; estado: string }>;
  };

  const enviada = lista.datos.find((c) => c.estado === 'ENVIADA');
  if (enviada) {
    cotizacionId = enviada.id;
    return;
  }

  const borrador = lista.datos.find((c) => c.estado === 'BORRADOR');
  expect(
    borrador,
    'hace falta una cotizacion (la deja 02-flujo-h1-h6) para poder aceptarla',
  ).toBeTruthy();

  const res = await page.request.post(`${URL_API}/api/v1/cotizaciones/${borrador!.id}/estado`, {
    data: { estado: 'ENVIADA' },
  });
  expect(res.status(), 'enviar la cotizacion').toBeLessThan(400);
  cotizacionId = borrador!.id;
});

test('a 390 px, el asesor marca aceptada desde el detalle y llega al archivo de viaje', async ({
  page,
}) => {
  expect(cotizacionId, 'el montaje debe haber dejado una cotizacion ENVIADA').not.toBe('');
  await page.goto(`/cotizaciones/${cotizacionId}`);

  // 1. La accion se ofrece, y es tocable con el pulgar.
  const boton = page.getByTestId('btn-marcar-aceptada');
  await expect(boton).toBeVisible({ timeout: 30_000 });
  await expect(boton).toBeEnabled();
  const caja = await boton.boundingBox();
  expect(caja?.height ?? 0, 'objetivo tactil de 44 px').toBeGreaterThanOrEqual(44);

  // Y la pantalla cabe en el celular: ni un pixel de desplazamiento lateral.
  const desborda = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(desborda, 'el detalle no debe desplazarse en horizontal a 390 px').toBe(false);

  // 2. Confirmar es un acto aparte, y dice lo que va a pasar antes de pulsar.
  await boton.click();
  const dialogo = page.getByTestId('dialogo-aceptar-cotizacion');
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText(/archivo de viaje/i);
  await expect(dialogo).toContainText(/queda cerrada/i);

  await page.getByTestId('btn-confirmar-aceptada').click();

  // 3. La pantalla refleja el cambio y ya no ofrece aceptarla otra vez.
  await expect(page.getByTestId('aviso-cotizacion-aceptada')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('btn-marcar-aceptada')).toHaveCount(0);
  await expect(page.getByText('ACEPTADA').first()).toBeVisible();

  // 4. El archivo de viaje: se espera a que el consumidor lo abra. Si la pantalla se cansa de
  //    buscar, ofrece buscarlo de nuevo; la prueba hace lo que haria la asesora.
  const enlace = page.getByTestId('enlace-archivo-recien-abierto');
  const reintentar = page.getByTestId('btn-reintentar-busqueda-archivo');
  await expect(async () => {
    if (await reintentar.isVisible()) await reintentar.click();
    await expect(enlace).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 90_000, intervals: [2_000, 3_000, 5_000] });

  // 5. Y ese enlace lleva de verdad al archivo de viaje.
  await enlace.click();
  await expect(page).toHaveURL(/\/viajes\?id=[0-9a-f-]{36}/);
});

test('la cotizacion aceptada ya no admite aceptarse de nuevo al volver a abrirla', async ({
  page,
}) => {
  await page.goto(`/cotizaciones/${cotizacionId}`);
  await expect(page.getByText('ACEPTADA').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('btn-marcar-aceptada')).toHaveCount(0);
  await expect(page.getByTestId('franja-cierre-de-venta')).toHaveCount(0);
});
