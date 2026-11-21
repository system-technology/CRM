import { enviarEstadoWhatsapp, enviarWebhookWhatsapp, enviosRecibidosPorGraph } from './auxiliares';
import { expect, test } from './fixtures';

/**
 * Flujo H1-H6 (campana T-126) en navegador contra la API real. H1 (ingreso) vive en
 * 01-ingreso. En serie y con estado compartido entre pasos: si uno falla, el resto se omite y el
 * informe dice cual fue el primero.
 *
 *   H2  mensaje entrante por el webhook firmado de la API
 *   H3  verlo en la bandeja (con recarga y en tiempo real)
 *   H4  abrir la conversacion
 *   H5  crear la oportunidad desde la conversacion y verla en el pipeline
 *   H6  cotizar un producto de la semilla, guardar la cotizacion, verla, y reportes
 *
 * Al final: responder desde la bandeja y enviar la cotizacion por WhatsApp, contra la Graph API
 * falsa (e2e/graph-falsa.mjs) que la API recibe en META_GRAPH_BASE_URL.
 */
test.describe.configure({ mode: 'serial' });

const marca = Date.now().toString(36);
const nombreViajero = `Viajero E2E ${marca}`;
// Un numero distinto por corrida: cada ejecucion crea su propio contacto y conversacion.
const telefono = `573${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
const textoEntrante = `Hola, quiero cotizar Cartagena ${marca}`;
const textoEnVivo = `Segundo mensaje en vivo ${marca}`;
const tituloOportunidad = `Oportunidad E2E ${marca}`;
const tituloCotizacion = `Cotizacion E2E ${marca}`;

let urlConversacion = '';
let rutaCotizacion = '';

test('H2: un webhook con firma invalida se rechaza con 403', async () => {
  const { estado } = await enviarWebhookWhatsapp(
    { texto: `no debe entrar ${marca}`, de: telefono, nombre: nombreViajero },
    { firmaValida: false },
  );
  expect(estado).toBe(403);
});

test('H2: un mensaje firmado de WhatsApp es aceptado', async () => {
  const { estado } = await enviarWebhookWhatsapp({
    texto: textoEntrante,
    de: telefono,
    nombre: nombreViajero,
  });
  expect(
    estado,
    'el numero de prueba debe estar ligado a la agencia demo (canal:registrar-prueba)',
  ).toBe(200);
});

test('H3: el mensaje entrante aparece en la bandeja', async ({ page }) => {
  await page.goto('/bandeja');
  const conversacion = page.getByRole('link', { name: new RegExp(marca) });
  // El consumidor procesa de forma asincrona: se recarga hasta que aparece o se agota el tiempo.
  await expect(async () => {
    await page.reload();
    await expect(conversacion.first()).toBeVisible({ timeout: 4_000 });
  }).toPass({ timeout: 40_000, intervals: [1_000, 2_000, 3_000] });
  await expect(conversacion.first()).toContainText(textoEntrante);
});

test('H3: un mensaje que llega con la bandeja abierta aparece sin recargar', async ({ page }) => {
  await page.goto('/bandeja');
  await expect(page.getByRole('region', { name: 'Lista de conversaciones' })).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(marca) }).first()).toBeVisible();
  await expect(page.getByTestId('indicador-desconectado')).toHaveCount(0);

  const { estado } = await enviarWebhookWhatsapp({
    texto: textoEnVivo,
    de: telefono,
    nombre: nombreViajero,
  });
  expect(estado).toBe(200);

  await expect(page.getByRole('link', { name: new RegExp(textoEnVivo) })).toBeVisible({
    timeout: 20_000,
  });
});

test('H4: abre la conversacion y ve los mensajes del viajero', async ({ page }) => {
  await page.goto('/bandeja');
  await page
    .getByRole('link', { name: new RegExp(marca) })
    .first()
    .click();
  await expect(page).toHaveURL(/\/bandeja\/[0-9a-f-]{36}$/);
  urlConversacion = new URL(page.url()).pathname;
  await expect(page.getByText(textoEntrante).first()).toBeVisible();
  await expect(page.getByText(textoEnVivo).first()).toBeVisible();
});

test('H5: crea una oportunidad desde la conversacion y aparece en el pipeline', async ({
  page,
}) => {
  expect(urlConversacion, 'H4 debe haber abierto la conversacion').not.toBe('');
  await page.goto(urlConversacion);
  await page.getByRole('button', { name: 'Crear oportunidad' }).first().click();

  await page.getByTestId('input-titulo-oportunidad').fill(tituloOportunidad);
  await page.getByTestId('input-destino-oportunidad').fill('Cartagena, Colombia');
  await page.getByTestId('input-valor-oportunidad').fill('4500000');
  await page.getByTestId('boton-guardar-oportunidad').click();
  await expect(page.getByTestId('input-titulo-oportunidad')).toHaveCount(0);

  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'Oportunidades' })).toBeVisible();
  await expect(page.getByText(tituloOportunidad).first()).toBeVisible({ timeout: 20_000 });
});

test('H6: cotiza un producto de la semilla y guarda la cotizacion', async ({ page }) => {
  await page.goto('/cotizador');
  await expect(page.getByRole('heading', { name: 'Cotizador Comercial' })).toBeVisible();
  await expect(page.locator('#select-paquete-cotizador')).toBeVisible({ timeout: 30_000 });
  // Si cayera a la maqueta, esta prueba pasaria contra datos inventados: se exige la API real.
  await expect(page.locator('#select-paquete-cotizador')).toHaveAttribute('data-origen', 'api');

  // La salida programada de la semilla: la fecha por omision del cotizador no tiene por que existir.
  const salidas = page.getByRole('button', { name: /^Seleccionar salida programada/ });
  if ((await salidas.count()) > 0) await salidas.first().click();

  const guardar = page.getByRole('button', { name: 'Guardar cotización', exact: true }).first();
  const errorDeCotizacion = page.locator('[role="alert"][aria-live="assertive"]');
  const opcionDeSalida = page.locator('#select-opcion-salida-cotizador');
  const acomodacion = page.locator('#select-acomodacion');

  // El producto puede exigir opcion de salida y acomodacion: se eligen las primeras que ofrece.
  await expect(async () => {
    if ((await opcionDeSalida.count()) > 0 && (await opcionDeSalida.inputValue()) === '') {
      await opcionDeSalida.selectOption({ index: 1 });
    }
    if ((await acomodacion.count()) > 0 && (await acomodacion.inputValue()) === '') {
      await acomodacion.selectOption({ index: 1 });
    }
    await expect(guardar).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 40_000, intervals: [500, 1_000, 2_000] });
  // Con el texto de la alerta en el fallo: «esperaba 0, recibio 1» no deja diagnosticar nada.
  const textoDeLaAlerta =
    (await errorDeCotizacion.count()) > 0 ? await errorDeCotizacion.first().innerText() : '';
  expect(textoDeLaAlerta, 'el cotizador mostro una alerta de error al cotizar').toBe('');

  await guardar.click();
  const dialogo = page.getByRole('dialog', { name: 'Guardar Cotización Oficial' });
  await expect(dialogo).toBeVisible();
  await dialogo.locator('#input-titulo-cotizacion').fill(tituloCotizacion);

  const contacto = dialogo.locator('#select-contacto-cotizacion option', {
    hasText: new RegExp(`${nombreViajero}|${telefono.slice(-7)}`),
  });
  expect(
    await contacto.count(),
    'el contacto creado por el webhook debe poder elegirse para la cotizacion',
  ).toBeGreaterThan(0);
  await dialogo
    .locator('#select-contacto-cotizacion')
    .selectOption((await contacto.first().getAttribute('value')) ?? '');

  await dialogo.getByRole('button', { name: /Confirmar y Guardar Cotización/ }).click();
  await expect(
    dialogo.getByRole('alert'),
    'guardar no debe fallar (ver el texto del error en la salida)',
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}/, { timeout: 20_000 });
  rutaCotizacion = new URL(page.url()).pathname;
  // El detalle tiene tres estados (cargando, error, contenido): si el titulo no aparece, el fallo
  // dice en cual quedo la pagina, con su texto visible.
  try {
    await expect(page.getByRole('heading', { name: tituloCotizacion })).toBeVisible({
      timeout: 15_000,
    });
  } catch {
    const texto = (
      await page
        .locator('main')
        .innerText()
        .catch(() => '')
    ).slice(0, 800);
    throw new Error(`El detalle de la cotizacion no mostro su titulo. Texto visible: ${texto}`);
  }
});

test('H6: la cotizacion guardada aparece en el directorio', async ({ page }) => {
  await page.goto('/cotizaciones');
  await expect(page.getByRole('heading', { name: 'Cotizaciones', level: 1 })).toBeVisible();
  // El directorio pinta cada cotizacion dos veces: tarjeta en movil (md:hidden) y fila en
  // escritorio. `.first()` cogia la tarjeta movil, oculta por diseno: se busca la visible.
  await expect(page.getByText(tituloCotizacion).filter({ visible: true }).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('H6: los reportes cargan con datos reales', async ({ page }) => {
  await page.goto('/reportes');
  await expect(page.getByRole('heading', { name: 'Reportes' })).toBeVisible();
  await expect(page.getByTestId('reportes-reales')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('reportes-error')).toHaveCount(0);
  await expect(page.getByTestId('reportes-sin-permiso')).toHaveCount(0);
});

// El envio sale por la API real hacia la Graph FALSA (e2e/graph-falsa.mjs, META_GRAPH_BASE_URL).
// La ventana de 24 h esta abierta: el viajero acaba de escribir por el webhook en esta misma suite.
test('H4: responder desde la bandeja deja el mensaje saliente enviado', async ({ page }) => {
  expect(urlConversacion, 'H4 debe haber abierto la conversacion').not.toBe('');
  const respuesta = `Con gusto te ayudo ${marca}`;
  await page.goto(urlConversacion);
  await page.getByPlaceholder(/Escribe tu respuesta a cliente/).fill(respuesta);
  await page.getByRole('button', { name: 'Enviar mensaje', exact: true }).click();

  // Primero lo esencial: el trabajador entrego el mensaje a la Graph de Meta (falsa en el CI).
  let wamidAceptado = '';
  await expect(async () => {
    const envios = await enviosRecibidosPorGraph();
    const recibido = envios.find((e) => e.texto === respuesta);
    expect(
      recibido,
      `la Graph falsa debe haber recibido el texto; recibio: ${JSON.stringify(envios.map((e) => e.texto))}`,
    ).toBeDefined();
    expect(recibido?.tipo).toBe('text');
    expect(recibido?.para).toBe(telefono);
    wamidAceptado = recibido?.wamid ?? '';
  }).toPass({ timeout: 40_000, intervals: [1_000, 2_000] });

  // Meta confirma con un webhook de estado `sent`; es lo que pasa el mensaje a ENVIADO. La Graph
  // falsa no lo manda: lo manda la prueba, firmado como el de Meta.
  expect(await enviarEstadoWhatsapp(wamidAceptado, 'sent', telefono)).toBe(200);

  // Despues, la bandeja lo refleja: la marca de enviado (Check) y nunca «Falló». Dentro del hilo
  // (role="log"): el mismo texto sale tambien en la vista previa de la lista.
  const burbuja = page.getByRole('log').getByText(respuesta, { exact: true }).locator('xpath=..');
  let textoDeLaBurbuja = '';
  await expect(async () => {
    await page.reload();
    await expect(burbuja).toBeVisible({ timeout: 4_000 });
    textoDeLaBurbuja = await burbuja.innerText();
    await expect(burbuja).not.toContainText('Falló');
    await expect(
      burbuja.locator('svg[class*="lucide-check"]:not([class*="lucide-check-check"])'),
      `la burbuja debe mostrar la marca de enviado; muestra: ${textoDeLaBurbuja}`,
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000, intervals: [1_000, 2_000, 3_000] });
});

test('H6: enviar la cotizacion por WhatsApp desde la conversacion', async ({ page }) => {
  expect(urlConversacion, 'H4 debe haber abierto la conversacion').not.toBe('');
  await page.goto(urlConversacion);
  await page.getByTestId('boton-abrir-enviar-cotizacion').click();

  const dialogo = page.getByRole('dialog', { name: 'Enviar cotización por WhatsApp' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByTestId('alerta-ventana-cerrada-cotizacion')).toHaveCount(0);
  const selector = dialogo.getByTestId('selector-cotizacion-conversacion');
  await expect(
    selector,
    'la cotizacion guardada para este contacto debe poder elegirse',
  ).toBeVisible({ timeout: 20_000 });
  const opcion = selector.locator('option', { hasText: tituloCotizacion });
  expect(await opcion.count()).toBeGreaterThan(0);
  await selector.selectOption((await opcion.first().getAttribute('value')) ?? '');

  await dialogo.getByTestId('boton-confirmar-enviar-cotizacion').click();
  await expect(
    dialogo.getByTestId('alerta-error-envio-cotizacion'),
    'el envio de la cotizacion no debe fallar',
  ).toHaveCount(0);
  await expect(dialogo.getByTestId('alerta-exito-envio-cotizacion')).toBeVisible({
    timeout: 20_000,
  });

  let texto = '';
  await expect(async () => {
    const envio = (await enviosRecibidosPorGraph()).find(
      (e) => e.para === telefono && (e.texto ?? '').startsWith('*Cotización:'),
    );
    expect(envio, 'la Graph falsa debe haber recibido el texto de la cotizacion').toBeDefined();
    texto = envio?.texto ?? '';
  }).toPass({ timeout: 30_000, intervals: [500, 1_000, 2_000] });

  expect(texto).toContain('*Total:');
  expect(texto).toContain('Fecha de salida:');
  // El viajero nunca ve el neto ni el margen (R8, T-073).
  expect(texto).not.toMatch(/\b(neto|margen|markup|comisi[oó]n)\b/i);
});

// T-321: la acción principal del detalle es «Enviar en esta conversación»: lleva al chat y abre el
// MISMO diálogo de envío por el canal con esa cotización elegida (no se envía de nuevo aquí).
test('H6: desde el detalle de la cotizacion se llega al envio por el canal en el chat', async ({
  page,
}) => {
  expect(
    rutaCotizacion,
    'la prueba de guardar debe haber dejado la ruta de la cotizacion',
  ).not.toBe('');
  await page.goto(rutaCotizacion);
  const enviar = page.getByTestId('btn-enviar-en-conversacion');
  await expect(enviar).toBeVisible({ timeout: 20_000 });
  await enviar.click();

  await expect(page).toHaveURL(/\/bandeja\/[0-9a-f-]{36}/, { timeout: 20_000 });
  const dialogo = page.getByRole('dialog', { name: 'Enviar cotización por WhatsApp' });
  await expect(dialogo).toBeVisible({ timeout: 20_000 });
  const idCotizacion = rutaCotizacion.split('/').pop() ?? '';
  await expect(dialogo.getByTestId('selector-cotizacion-conversacion')).toHaveValue(idCotizacion, {
    timeout: 20_000,
  });
});
