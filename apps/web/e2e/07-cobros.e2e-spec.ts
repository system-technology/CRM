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

/**
 * Una parte del saldo que queda por cobrar, escrita como la escribiria la asesora (`620.000`).
 *
 * Derivada del saldo REAL que devuelve el servidor, nunca una constante: un monto fijo mayor que
 * el total de la cotizacion de la semilla seria un sobrepago y el servidor lo rechazaria, que es
 * justo lo que paso la primera vez que corrio esta prueba.
 */
async function parteDelSaldo(
  page: Page,
  divisor: number,
): Promise<{ escrito: string; pintado: string; restante: string }> {
  const cobro = (await json(page, `/api/v1/archivos/${archivoId}/cobro`)) as {
    moneda: string;
    saldo: { unidades: string };
  };
  // En COP la unidad minima es el peso (R8), asi que las unidades se escriben tal cual.
  expect(cobro.moneda, 'la agencia de la semilla cotiza en pesos').toBe('COP');
  const saldo = Number(cobro.saldo.unidades);
  expect(saldo, 'tiene que quedar saldo por cobrar para poder pagar una parte').toBeGreaterThan(
    divisor * 100,
  );
  const unidades = Math.floor(saldo / divisor);
  const conMiles = unidades.toLocaleString('es-CO');
  // Lo que debe quedar por cobrar tras ese pago: saldo del servidor menos lo pagado.
  const restante = (saldo - unidades).toLocaleString('es-CO');
  return { escrito: conMiles, pintado: conMiles, restante };
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

  // Si el dialogo no se cierra es que el pago se rechazo: el fallo dice POR QUE, no solo que
  // seguia abierto.
  try {
    await expect(dialogo).toHaveCount(0, { timeout: 20_000 });
  } catch {
    const motivo = await page
      .getByTestId('error-registrar-pago')
      .innerText()
      .catch(() => '(sin mensaje en el dialogo)');
    throw new Error(`El pago de ${escrito} no se registro. La pantalla dijo: ${motivo}`);
  }
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

  // Un cuarto de lo que falta por cobrar: un pago parcial de verdad, nunca un sobrepago.
  const pago = await parteDelSaldo(page, 4);
  await registrarPago(page, pago.escrito);

  // La confirmacion usa el mismo verbo que el boton.
  const confirmacion = page.getByTestId('pago-registrado');
  await expect(confirmacion).toBeVisible();
  await expect(confirmacion).toContainText('Pago registrado');
  await expect(confirmacion).toContainText(pago.pintado);

  // La cifra que se pinta es la que se escribio: ni un cero de mas (R8, en COP la unidad es el peso).
  expect(await cifra(page, 'Pagado')).toBe(pago.pintado);
  // El saldo se recalcula: lo que habia menos lo pagado, no solo «distinto del total».
  expect(await cifra(page, 'Falta por cobrar')).toBe(pago.restante);

  const historial = page.getByTestId('historial-de-pagos');
  await expect(historial).toBeVisible();
  await expect(historial.getByRole('listitem')).toHaveCount(1);
  await expect(historial).toContainText('Transferencia');
  await expect(historial).toContainText(pago.pintado);

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
  const pago = await parteDelSaldo(page, 4);
  await registrarPago(page, pago.escrito);
  await sinDesborde('tras registrar el pago');

  await expect(page.getByTestId('pago-registrado')).toBeVisible();
  expect(await cifra(page, 'Pagado')).not.toBe(pagadoAntes);
  expect(await cifra(page, 'Falta por cobrar'), 'el saldo baja en lo pagado').toBe(pago.restante);
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
