import { enviarWebhookWhatsapp } from './auxiliares';
import { expect, test } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * Etiquetas de conversación en la bandeja (T-326, HU-inbox-1): etiquetar un chat con un toque y
 * filtrar la bandeja por etiqueta, en escritorio (1440×900) y en móvil (390×844).
 *
 * No depende de datos sembrados: cada corrida crea SUS dos conversaciones por el webhook firmado y
 * SU etiqueta por la API (con la sesión del dueño que dejó `01-ingreso`), y al final la borra. Con
 * un nombre único por corrida, el filtro solo puede devolver la conversación que esta prueba
 * etiquetó, haya lo que haya en la agencia.
 *
 * Ligera a propósito (límite de tasa 429): solo `/bandeja` y sus chats, nunca catálogo, reportes ni
 * Configuración. Selectores por rol y testid, cada uno con un solo elemento (nada de alternativas ambiguas).
 */
test.describe.configure({ mode: 'serial' });

const marca = Date.now().toString(36);
const nombreA = `Etiquetas A ${marca}`;
const nombreB = `Etiquetas B ${marca}`;
// 30 caracteres como máximo: «E2E » + la marca.
const etiqueta = `E2E ${marca}`;
const telefonoA = `573${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
const telefonoB = `573${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;

let idEtiqueta = '';
let urlChatA = '';

const filaDe = (page: Page, nombre: string) =>
  page.getByRole('link', { name: new RegExp(nombre) }).first();
const chipsConEtiqueta = (donde: Locator) =>
  donde.getByTestId('chip-de-etiqueta').filter({ hasText: etiqueta });

async function sinDesbordeHorizontal(page: Page): Promise<void> {
  const ancho = await page.evaluate(() => {
    const d = document.documentElement;
    return d.scrollWidth - d.clientWidth;
  });
  expect(ancho, 'la página no debe desplazarse a lo ancho').toBeLessThanOrEqual(0);
}

async function esObjetivoTactil(elemento: Locator, minimo = 44): Promise<void> {
  const caja = await elemento.boundingBox();
  expect(caja, 'el elemento debe estar visible para medirlo').not.toBeNull();
  expect(caja?.width ?? 0).toBeGreaterThanOrEqual(minimo);
  expect(caja?.height ?? 0).toBeGreaterThanOrEqual(minimo);
}

/** El consumidor del webhook es asíncrono: se recarga hasta que la conversación aparece. */
async function esperarConversacion(page: Page, nombre: string): Promise<void> {
  await page.goto('/bandeja');
  await expect(async () => {
    await page.reload();
    await expect(filaDe(page, nombre)).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000, intervals: [1_000, 2_000, 3_000] });
}

test('prepara: dos conversaciones por el webhook y una etiqueta propia por la API', async ({
  page,
}) => {
  for (const [texto, de, nombre] of [
    [`Hola, soy A ${marca}`, telefonoA, nombreA],
    [`Hola, soy B ${marca}`, telefonoB, nombreB],
  ] as const) {
    const { estado } = await enviarWebhookWhatsapp({ texto, de, nombre });
    expect(estado, 'el numero de prueba debe estar ligado a la agencia demo').toBe(200);
  }

  // La API exige `etiquetas.administrar`: el dueño sembrado lo tiene. Mismo origen que la web.
  const respuesta = await page.request.post('/api/v1/etiquetas', {
    data: { nombre: etiqueta, color: 'turquesa' },
  });
  expect(respuesta.status(), await respuesta.text()).toBe(201);
  const creada = (await respuesta.json()) as { id: string; nombre: string; color: string };
  expect(creada.nombre).toBe(etiqueta);
  expect(creada.id).toMatch(/^[0-9a-f-]{36}$/);
  idEtiqueta = creada.id;
});

test('escritorio: etiqueta una conversación desde el chat y se ve en el chat y en la lista', async ({
  page,
}) => {
  expect(idEtiqueta, 'el paso de preparación debe haber creado la etiqueta').not.toBe('');
  await esperarConversacion(page, nombreA);
  await filaDe(page, nombreA).click();
  await expect(page).toHaveURL(/\/bandeja\/[0-9a-f-]{36}$/);
  urlChatA = new URL(page.url()).pathname;

  const tira = page.getByTestId('etiquetas-del-chat');
  await expect(tira).toBeVisible();
  await expect(chipsConEtiqueta(tira)).toHaveCount(0);

  await page.getByTestId('boton-agregar-etiqueta').click();
  const selector = page.getByTestId('selector-de-etiquetas');
  const opcion = selector.getByRole('menuitemcheckbox', { name: etiqueta, exact: true });
  await expect(opcion).toBeVisible();
  await expect(opcion).toHaveAttribute('aria-checked', 'false');
  await opcion.click();

  await expect(opcion).toHaveAttribute('aria-checked', 'true');
  await expect(chipsConEtiqueta(tira)).toHaveCount(1);
  // El cambio llegó al servidor: no hay aviso de error.
  await expect(page.getByTestId('aviso-de-etiqueta')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(selector).toHaveCount(0);

  // La fila de la lista lo muestra sin recargar...
  await expect(chipsConEtiqueta(filaDe(page, nombreA))).toHaveCount(1);
  // ...y sigue ahí tras recargar: está guardado en el servidor, no solo en pantalla.
  await page.reload();
  await expect(chipsConEtiqueta(page.getByTestId('etiquetas-del-chat'))).toHaveCount(1);
  await expect(chipsConEtiqueta(filaDe(page, nombreA))).toHaveCount(1);
  // La otra conversación no se tocó.
  await expect(chipsConEtiqueta(filaDe(page, nombreB))).toHaveCount(0);
});

test('escritorio: filtra la bandeja por la etiqueta y el filtro vive en la URL', async ({
  page,
}) => {
  await esperarConversacion(page, nombreA);
  await expect(filaDe(page, nombreB)).toBeVisible();

  await page.getByTestId('boton-filtro-etiquetas').click();
  const selector = page.getByTestId('selector-de-filtro-de-etiquetas');
  await selector.getByRole('menuitemcheckbox', { name: etiqueta, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`[?&]etiquetas=${idEtiqueta}(&|$)`));
  await page.getByTestId('selector-de-filtro-de-etiquetas-cerrar').click();
  await expect(selector).toHaveCount(0);

  // Solo la etiquetada; la otra sale de la lista.
  await expect(filaDe(page, nombreA)).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(nombreB) })).toHaveCount(0);
  const barra = page.getByTestId('barra-filtro-etiquetas');
  await expect(chipsConEtiqueta(barra)).toHaveCount(1);

  // Abrir el chat conserva el filtro en la URL, y volver también.
  await filaDe(page, nombreA).click();
  await expect(page).toHaveURL(new RegExp(`/bandeja/[0-9a-f-]{36}\\?etiquetas=${idEtiqueta}`));
  await page
    .getByRole('navigation', { name: 'Migas de pan' })
    .getByRole('link', { name: 'Bandeja' })
    .click();
  await expect(page).toHaveURL(new RegExp(`/bandeja\\?etiquetas=${idEtiqueta}`));

  // Recargar conserva el filtro.
  await page.reload();
  await expect(chipsConEtiqueta(page.getByTestId('barra-filtro-etiquetas'))).toHaveCount(1);
  await expect(filaDe(page, nombreA)).toBeVisible();

  // Quitar el filtro devuelve la otra conversación.
  await page.getByTestId('quitar-filtro-etiquetas').click();
  await expect(page).not.toHaveURL(/etiquetas=/);
  await expect(filaDe(page, nombreB)).toBeVisible();
  await expect(page.getByTestId('barra-filtro-etiquetas')).toHaveCount(0);
});

test('escritorio: un id que no es UUID en la URL no llega a la API y se limpia', async ({
  page,
}) => {
  await page.goto(`/bandeja?etiquetas=${idEtiqueta},no-es-un-uuid`);
  await expect(page).toHaveURL(new RegExp(`[?&]etiquetas=${idEtiqueta}$`), { timeout: 20_000 });
  await expect(filaDe(page, nombreA)).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(nombreB) })).toHaveCount(0);
});

test.describe('móvil 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('quitar con un toque, poner con dos y filtrar con el pulgar, sin desbordes', async ({
    page,
  }) => {
    expect(urlChatA, 'el paso de escritorio debe haber abierto el chat').not.toBe('');
    await esperarConversacion(page, nombreA);
    await sinDesbordeHorizontal(page);

    // La lista: chip con el nombre escrito en la fila y el botón del filtro con zona táctil.
    await expect(chipsConEtiqueta(filaDe(page, nombreA))).toHaveCount(1);
    await esObjetivoTactil(page.getByTestId('boton-filtro-etiquetas'));

    // El chat: la «×» del chip y «+ Etiqueta» miden 44 × 44 px o más.
    await filaDe(page, nombreA).tap();
    await expect(page).toHaveURL(/\/bandeja\/[0-9a-f-]{36}$/);
    const tira = page.getByTestId('etiquetas-del-chat');
    await expect(chipsConEtiqueta(tira)).toHaveCount(1);
    const quitar = tira.getByRole('button', { name: `Quitar etiqueta ${etiqueta}` });
    await esObjetivoTactil(quitar);
    await esObjetivoTactil(page.getByTestId('boton-agregar-etiqueta'));
    await sinDesbordeHorizontal(page);

    // Quitar: un toque.
    await quitar.tap();
    await expect(chipsConEtiqueta(tira)).toHaveCount(0);
    await expect(page.getByTestId('aviso-de-etiqueta')).toHaveCount(0);

    // Poner: «+ Etiqueta» y tocar la etiqueta (dos toques). Filas de 48 px o más.
    await page.getByTestId('boton-agregar-etiqueta').tap();
    const selector = page.getByTestId('selector-de-etiquetas');
    const opcion = selector.getByRole('menuitemcheckbox', { name: etiqueta, exact: true });
    await expect(opcion).toBeVisible();
    await esObjetivoTactil(opcion, 44);
    const caja = await opcion.boundingBox();
    expect(caja?.height ?? 0).toBeGreaterThanOrEqual(48);
    await esObjetivoTactil(page.getByTestId('selector-de-etiquetas-cerrar'));
    await opcion.tap();
    await expect(chipsConEtiqueta(tira)).toHaveCount(1);
    await sinDesbordeHorizontal(page);

    // La hoja se cierra con «Listo» y no deja tapado el compositor de mensajes.
    await page.getByTestId('selector-de-etiquetas-cerrar').tap();
    await expect(selector).toHaveCount(0);
    await expect(page.getByPlaceholder(/Escribe tu respuesta/)).toBeVisible();

    // Filtrar con el pulgar: Etiquetas → etiqueta → Listo.
    await page.getByRole('link', { name: 'Volver a lista de conversaciones' }).tap();
    await expect(page).toHaveURL(/\/bandeja$/);
    await page.getByTestId('boton-filtro-etiquetas').tap();
    const hojaFiltro = page.getByTestId('selector-de-filtro-de-etiquetas');
    await hojaFiltro.getByRole('menuitemcheckbox', { name: etiqueta, exact: true }).tap();
    await page.getByTestId('selector-de-filtro-de-etiquetas-cerrar').tap();
    await expect(filaDe(page, nombreA)).toBeVisible();
    await expect(page.getByRole('link', { name: new RegExp(nombreB) })).toHaveCount(0);
    await expect(page.getByTestId('barra-filtro-etiquetas')).toBeVisible();
    await esObjetivoTactil(page.getByTestId('quitar-filtro-etiquetas'));
    await sinDesbordeHorizontal(page);

    // La barra inferior sigue a la vista y no queda tapada por la lista.
    await expect(page.getByRole('navigation', { name: 'Navegación móvil inferior' })).toBeVisible();
  });
});

test('limpieza: borra la etiqueta de la prueba', async ({ page }) => {
  expect(idEtiqueta).not.toBe('');
  const respuesta = await page.request.delete(`/api/v1/etiquetas/${idEtiqueta}`);
  expect(respuesta.status(), await respuesta.text()).toBe(200);
  const lista = await page.request.get('/api/v1/etiquetas');
  const { datos } = (await lista.json()) as { datos: { id: string }[] };
  expect(datos.map((e) => e.id)).not.toContain(idEtiqueta);
});
