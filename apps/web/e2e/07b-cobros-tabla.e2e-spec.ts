import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { URL_API } from './auxiliares';

/**
 * «Cobros»: quién pagó y quién debe (T-332, T-335), contra la API REAL.
 *
 * Lo que se demuestra: se llega a la pantalla en dos clics desde otra; la tabla enseña total,
 * pagado y saldo por archivo; registrar un pago cambia el saldo Y el filtro (el archivo sale de
 * «con saldo» y entra en «Al día»); el CSV trae lo que se ve; y cabe a 390, 768 y 1440 px sin
 * desplazamiento lateral. Las cifras que se comparan salen del servidor: la prueba no calcula.
 */
test.describe.configure({ mode: 'serial' });

let archivoId = '';
let numero = 0;
let saldoAntes = 0;
let estadoAntes = '';

const ETIQUETA: Record<string, string> = {
  SALDO_PENDIENTE: 'Saldo pendiente',
  POR_VENCER: 'Por vencer',
  VENCIDO: 'Vencido',
};

async function json(page: Page, ruta: string): Promise<Record<string, unknown>> {
  const res = await page.request.get(`${URL_API}${ruta}`);
  expect(res.status(), `GET ${ruta}`).toBeLessThan(400);
  return (await res.json()) as Record<string, unknown>;
}

/** Filas de la tabla (la de escritorio) o de las tarjetas (móvil): las que estén visibles. */
const fila = (page: Page, n: number) =>
  page
    .getByTestId('fila-de-cobro')
    .filter({ hasText: `File ${n}` })
    .locator('visible=true');

async function sinDesborde(page: Page, donde: string): Promise<void> {
  const ancho = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(ancho, `desbordamiento horizontal ${donde}`).toBeLessThanOrEqual(0);
}

test('un archivo con saldo aparece en «Cobros» con total, pagado y saldo del servidor', async ({
  page,
}) => {
  // Cualquier archivo abierto con saldo por cobrar: lo que dejaron los otros e2e o el flujo H1-H6.
  const vista = (await json(page, '/api/v1/cobros?limite=50')) as {
    datos: Array<{
      archivoId: string;
      numero: number;
      moneda?: string;
      saldo: { unidades: string; moneda: string };
      estadoDeCobro: string;
    }>;
  };
  const candidato = vista.datos.find((f) => BigInt(f.saldo.unidades) > 0n);
  expect(
    candidato,
    'hace falta un archivo abierto con saldo por cobrar (lo deja 07-cobros)',
  ).toBeTruthy();
  archivoId = candidato!.archivoId;
  numero = candidato!.numero;
  estadoAntes = candidato!.estadoDeCobro;
  expect(candidato!.saldo.moneda, 'la agencia de la semilla cotiza en pesos').toBe('COP');
  saldoAntes = Number(candidato!.saldo.unidades); // En COP la unidad mínima es el peso (R8).

  await page.goto('/cobros');
  await expect(page.getByRole('heading', { level: 1, name: 'Cobros' })).toBeVisible({
    timeout: 30_000,
  });
  const f = fila(page, numero);
  await expect(f).toBeVisible();
  await expect(f).toContainText(saldoAntes.toLocaleString('es-CO'));
  await expect(f).toContainText(ETIQUETA[estadoAntes] ?? 'Al día');
});

test('registrar un pago cambia el saldo y cambia el filtro', async ({ page }) => {
  // Antes: el archivo está en su filtro actual.
  await page.goto('/cobros');
  const grupo = page.getByRole('group', { name: 'Filtrar por estado de cobro' });
  await grupo.getByRole('button', { name: ETIQUETA[estadoAntes]!, exact: true }).click();
  await expect(fila(page, numero)).toBeVisible({ timeout: 30_000 });

  // Se paga TODO lo que falta, desde el archivo de viaje, con el diálogo de siempre.
  await page.goto(`/viajes?id=${archivoId}`);
  await expect(page.getByTestId('panel-de-cobro')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('abrir-registrar-pago').click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Cuánto pagó *').fill(saldoAntes.toLocaleString('es-CO'));
  await dialogo.getByLabel('Cómo pagó *').selectOption('TRANSFERENCIA');
  await dialogo.getByRole('button', { name: 'Registrar pago', exact: true }).click();
  await expect(dialogo).toHaveCount(0, { timeout: 20_000 });

  // Después: ya no está en el filtro con saldo, y sí en «Al día», con saldo cero.
  await page.goto('/cobros');
  await grupo.getByRole('button', { name: ETIQUETA[estadoAntes]!, exact: true }).click();
  await expect(page.getByTestId('fila-de-cobro').filter({ hasText: `File ${numero}` })).toHaveCount(
    0,
  );

  await grupo.getByRole('button', { name: 'Al día', exact: true }).click();
  const f = fila(page, numero);
  await expect(f).toBeVisible({ timeout: 30_000 });
  await expect(f).toContainText('Pagado');
});

test('el CSV trae lo que se ve y neutraliza las fórmulas', async ({ page }) => {
  await page.goto('/cobros');
  await page
    .getByRole('group', { name: 'Filtrar por estado de cobro' })
    .getByRole('button', { name: 'Al día', exact: true })
    .click();
  await expect(fila(page, numero)).toBeVisible({ timeout: 30_000 });
  const visibles = await page.getByTestId('fila-de-cobro').locator('visible=true').count();

  const [descarga] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('boton-exportar-cobros-csv').click(),
  ]);
  expect(descarga.suggestedFilename()).toMatch(/^cobros-viajapro-al-dia-\d{4}-\d{2}-\d{2}\.csv$/);
  const ruta = await descarga.path();
  const { readFile } = await import('node:fs/promises');
  const texto = (await readFile(ruta, 'utf8')).replace('﻿', '');
  const lineas = texto.split('\r\n');
  expect(lineas, 'una línea por fila visible, más la cabecera').toHaveLength(visibles + 1);
  expect(lineas[0]).toBe(
    'File;Destino;Salida;Moneda;Total;Pagado;Saldo;Situación;Estado de cobro;Fecha límite',
  );
  expect(lineas[0]!.toLowerCase()).not.toMatch(/neto|margen/);
  expect(lineas.some((l) => l.startsWith(`${numero};`))).toBe(true);
  // Ninguna celda de texto arranca con un disparador de fórmula.
  for (const l of lineas.slice(1)) {
    for (const celda of l.split(';')) {
      expect(celda, 'celda con prefijo de fórmula').not.toMatch(/^["]?[=+@\t\r]/);
    }
  }
});

test('se llega en dos clics desde otra pantalla (escritorio)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/bandeja');
  await page
    .getByRole('navigation', { name: 'Barra de módulos lateral' })
    .getByRole('link', { name: 'Cobros', exact: true })
    .click();
  await expect(page).toHaveURL(/\/cobros$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Cobros' })).toBeVisible();
});

for (const [nombre, ancho, alto] of [
  ['390 px (celular)', 390, 844],
  ['768 px (tableta)', 768, 1024],
  ['1440 px (escritorio)', 1440, 900],
] as const) {
  test(`a ${nombre} no hay desplazamiento lateral y el contenido cabe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: alto });
    await page.goto('/cobros');
    await expect(page.getByRole('heading', { level: 1, name: 'Cobros' })).toBeVisible({
      timeout: 30_000,
    });
    await expect(fila(page, numero).or(page.getByTestId('cobros-vacio')).first()).toBeVisible({
      timeout: 30_000,
    });
    await sinDesborde(page, `a ${ancho} px`);
    for (const boton of await page
      .getByRole('group', { name: 'Filtrar por estado de cobro' })
      .getByRole('button')
      .all()) {
      const caja = await boton.boundingBox();
      expect(caja!.height, 'objetivo táctil de 44 px').toBeGreaterThanOrEqual(44);
      expect(caja!.x + caja!.width).toBeLessThanOrEqual(ancho);
    }
  });
}

test('a 390 px «Cobros» está a dos toques: Más, Cobros', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/bandeja');
  await page
    .getByRole('navigation', { name: 'Navegación móvil inferior' })
    .getByRole('button', { name: 'Más', exact: true })
    .click();
  await page.getByRole('dialog', { name: 'Más opciones' }).getByTestId('mas-modulo-cobros').click();
  await expect(page).toHaveURL(/\/cobros$/);
});
