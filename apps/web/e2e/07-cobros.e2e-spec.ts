import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { URL_API } from './auxiliares';

/**
 * Cobro al viajero en el archivo de viaje (T-331, ADR-0034), contra la API REAL.
 *
 * Lo que se demuestra: el archivo enseña total, pagado, saldo e historial; la asesora registra un
 * PAGO con moneda, fecha y medio; el verbo del boton y el de su confirmacion coinciden
 * («registrar»); y todo eso cabe a 390 px sin desplazamiento lateral.
 *
 * El saldo que se comprueba es el que devuelve el servidor: la prueba no suma ni resta nada, igual
 * que la pantalla.
 */
test.describe.configure({ mode: 'serial' });

/** Montos en la unidad minima de COP, que es el PESO (R8): 1.500.000 son un millon y medio. */
const PRIMER_PAGO = { escrito: '1.500.000', pintado: '1.500.000' };
const SEGUNDO_PAGO = { escrito: '500000', pintado: '500.000' };

let archivoId = '';
let totalPintado = '';

async function json(page: Page, ruta: string): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${URL_API}${ruta}`);
  expect(res.status(), `GET ${ruta}`).toBeLessThan(400);
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Un archivo de viaje abierto sobre el que cobrar. Si el flujo H1-H6 ya dejo uno, se usa ese; si
 * no, nace como nace de verdad: aceptando una cotizacion. El archivo lo crea el consumidor del
 * evento de aceptacion (ADR-0024 §1), asi que se espera a que aparezca en vez de darlo por hecho.
 */
async function archivoDeViajeAbierto(page: Page): Promise<string> {
  const lista = (await json(page, '/api/v1/archivos?estado=ABIERTO&limite=5')) as {
    datos: Array<{ id: string }>;
  };
  if (lista.datos.length > 0) return lista.datos[0]!.id;

  const cotizaciones = (await json(page, '/api/v1/cotizaciones?limite=20')) as {
    datos: Array<{ id: string; estado: string }>;
  };
  const cotizacion = cotizaciones.datos.find(
    (c) => c.estado === 'ENVIADA' || c.estado === 'BORRADOR',
  );
  expect(cotizacion, 'hace falta una cotizacion para que nazca un archivo de viaje').toBeTruthy();

  const cambiar = async (estado: string): Promise<number> => {
    const res = await page.request.post(`${URL_API}/api/v1/cotizaciones/${cotizacion!.id}/estado`, {
      data: { estado },
    });
    return res.status();
  };
  if (cotizacion!.estado === 'BORRADOR') {
    expect(await cambiar('ENVIADA'), 'enviar la cotizacion').toBeLessThan(400);
  }
  expect(await cambiar('ACEPTADA'), 'aceptar la cotizacion').toBeLessThan(400);

  let id = '';
  await expect(async () => {
    const abiertos = (await json(page, '/api/v1/archivos?estado=ABIERTO&limite=5')) as {
      datos: Array<{ id: string }>;
    };
    expect(
      abiertos.datos.length,
      'el archivo de viaje nace del evento de aceptacion',
    ).toBeGreaterThan(0);
    id = abiertos.datos[0]!.id;
  }).toPass({ timeout: 40_000, intervals: [1_000, 2_000, 3_000] });
  return id;
}

/** Cifra visible de un dato del panel, sin simbolo de moneda ni espacios. */
async function cifra(page: Page, etiqueta: string): Promise<string> {
  const texto = await page
    .getByTestId('panel-de-cobro')
    .locator('dt', { hasText: new RegExp(`^${etiqueta}$`) })
    .locator('xpath=following-sibling::dd[1]')
    .innerText();
  return texto.replace(/[^\d.,]/g, '');
}

async function registrarPago(page: Page, escrito: string): Promise<void> {
  await page.getByTestId('abrir-registrar-pago').click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();

  // El verbo del boton que abre y el del que confirma son el mismo: «Registrar pago».
  await expect(dialogo.getByRole('button', { name: 'Registrar pago', exact: true })).toBeVisible();
  await expect(dialogo.getByRole('button', { name: /^Guardar/ })).toHaveCount(0);

  await dialogo.getByLabel('Cuánto pagó *').fill(escrito);
  await dialogo.getByLabel('Cómo pagó *').selectOption('TRANSFERENCIA');
  // La fecha llega con el dia de hoy en la zona de la agencia: se deja como esta.
  await expect(dialogo.getByTestId('fecha-del-pago')).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
  await dialogo.getByRole('button', { name: 'Registrar pago', exact: true }).click();

  await expect(dialogo).toHaveCount(0, { timeout: 20_000 });
}

test('el archivo de viaje muestra total, pagado, saldo e historial vacio', async ({ page }) => {
  archivoId = await archivoDeViajeAbierto(page);
  await page.goto(`/viajes?id=${archivoId}`);

  const panel = page.getByTestId('panel-de-cobro');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('heading', { name: 'Cobro al viajero' })).toBeVisible();

  totalPintado = await cifra(page, 'Total del viaje');
  expect(totalPintado, 'el total del archivo debe ser una cifra').not.toBe('');
  expect(await cifra(page, 'Pagado')).toBe('0');
  // El saldo lo deriva el servidor: al no haber pagos, es el total.
  expect(await cifra(page, 'Falta por cobrar')).toBe(totalPintado);

  await expect(page.getByTestId('historial-vacio')).toBeVisible();
  await expect(page.getByTestId('historial-de-pagos')).toHaveCount(0);
});

test('registrar un pago baja el saldo y lo deja en el historial', async ({ page }) => {
  await page.goto(`/viajes?id=${archivoId}`);
  await expect(page.getByTestId('panel-de-cobro')).toBeVisible({ timeout: 30_000 });

  await registrarPago(page, PRIMER_PAGO.escrito);

  // La confirmacion usa el mismo verbo que el boton.
  const confirmacion = page.getByTestId('pago-registrado');
  await expect(confirmacion).toBeVisible();
  await expect(confirmacion).toContainText('Pago registrado');
  await expect(confirmacion).toContainText(PRIMER_PAGO.pintado);

  // La cifra que se pinta es la que se escribio: ni un cero de mas (R8, en COP la unidad es el peso).
  expect(await cifra(page, 'Pagado')).toBe(PRIMER_PAGO.pintado);
  expect(await cifra(page, 'Falta por cobrar')).not.toBe(totalPintado);

  const historial = page.getByTestId('historial-de-pagos');
  await expect(historial).toBeVisible();
  await expect(historial.getByRole('listitem')).toHaveCount(1);
  await expect(historial).toContainText('Transferencia');
  await expect(historial).toContainText(PRIMER_PAGO.pintado);

  // Al recargar sigue ahi: lo guardo el servidor, no la pantalla.
  await page.reload();
  await expect(page.getByTestId('historial-de-pagos').getByRole('listitem')).toHaveCount(1, {
    timeout: 30_000,
  });
});

test('a 390 px se ve el saldo y se registra un pago sin desplazamiento lateral', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/viajes?id=${archivoId}`);

  const panel = page.getByTestId('panel-de-cobro');
  await expect(panel).toBeVisible({ timeout: 30_000 });

  const sinDesborde = async (donde: string): Promise<void> => {
    const ancho = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(ancho, `desbordamiento horizontal ${donde}`).toBeLessThanOrEqual(0);
  };
  await sinDesborde('con el panel de cobro abierto');

  // El saldo cabe en la pantalla, no solo en el DOM.
  const caja = await panel
    .locator('dt', { hasText: /^Falta por cobrar$/ })
    .locator('xpath=following-sibling::dd[1]')
    .boundingBox();
  expect(caja, 'el saldo debe estar visible a 390 px').not.toBeNull();
  expect(caja!.x).toBeGreaterThanOrEqual(0);
  expect(caja!.x + caja!.width).toBeLessThanOrEqual(390);

  // El boton principal es un objetivo tactil de 44 px.
  const boton = page.getByTestId('abrir-registrar-pago');
  const cajaBoton = await boton.boundingBox();
  expect(cajaBoton!.height).toBeGreaterThanOrEqual(44);

  const pagadoAntes = await cifra(page, 'Pagado');
  await registrarPago(page, SEGUNDO_PAGO.escrito);
  await sinDesborde('tras registrar el pago');

  await expect(page.getByTestId('pago-registrado')).toBeVisible();
  expect(await cifra(page, 'Pagado')).not.toBe(pagadoAntes);
  await expect(page.getByTestId('historial-de-pagos').getByRole('listitem')).toHaveCount(2);
});

test('el dialogo rechaza un monto mal escrito antes de llamar a la API', async ({ page }) => {
  await page.goto(`/viajes?id=${archivoId}`);
  await expect(page.getByTestId('panel-de-cobro')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('abrir-registrar-pago').click();
  const dialogo = page.getByRole('dialog');
  // En COP no hay centavos: se dice, no se redondea a escondidas.
  await dialogo.getByLabel('Cuánto pagó *').fill('1.250,50');
  await dialogo.getByLabel('Cómo pagó *').selectOption('EFECTIVO');
  await dialogo.getByRole('button', { name: 'Registrar pago', exact: true }).click();

  await expect(page.getByTestId('error-registrar-pago')).toContainText('centavos');
  await expect(dialogo).toBeVisible();
  await dialogo.getByRole('button', { name: 'Volver' }).click();
  await expect(dialogo).toHaveCount(0);

  // Nada se registro: el historial sigue con los dos pagos de antes.
  await expect(page.getByTestId('historial-de-pagos').getByRole('listitem')).toHaveCount(2);
});
