import { randomInt } from 'node:crypto';
import type { Browser, BrowserContext, Page } from '@playwright/test';
import { URL_API, credenciales, ingresarPorPantalla } from './auxiliares';
import { expect, test } from './fixtures';

/**
 * Reportes por nivel de acceso, en el NAVEGADOR y contra la API REAL (T-346, ADR-0035).
 *
 * Lo que se demuestra: el alcance lo impone el SERVIDOR con la sesion, no el menu ni la pantalla.
 *   - Ana (asesora) entra a /reportes y ve «Mis numeros»: SUS cifras, sin el selector de agencia,
 *     sin el dashboard de administracion y sin el nombre de su companero.
 *   - Carlos (asesor, misma agencia) ve las suyas, distintas de las de Ana.
 *   - La duena (la sesion del proyecto) ve toda la agencia, con los dos asesores comparados.
 *   - Ana, desde SU navegador y con SU cookie, pide las cifras de Carlos y el servidor responde 403:
 *     ocultar un item no es control de acceso.
 *
 * **Las cifras distintas se siembran aqui.** La semilla no les da movimiento a Ana y Carlos, y una
 * prueba donde los dos ven cero pasaria en verde sin probar nada: cada uno crea, por la API y con
 * su propia sesion, un numero distinto de oportunidades (Ana 2, Carlos 3; el servidor las atribuye
 * a quien las crea). Todo se compara por DIFERENCIA contra lo que cada pantalla mostraba antes,
 * asi que no depende de lo que haya dejado el resto del flujo.
 *
 * Entran con la clave de desarrollo de la semilla (`identidad:sembrar-dev` la pone a TODAS las
 * identidades `@agenciademo.test`) y a 390 px, que es donde se abre esto.
 */
test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 390, height: 844 } });

const CORREO_ANA = 'ana@agenciademo.test';
const CORREO_CARLOS = 'carlos@agenciademo.test';
const NOMBRE_ANA = 'Ana Lucía Pérez';
const NOMBRE_CARLOS = 'Carlos Mejía';
const OPORTUNIDADES_DE_ANA = 2;
const OPORTUNIDADES_DE_CARLOS = 3;

interface ResumenCapturado {
  alcance: string;
  oportunidades?: { creadas: number; abiertas: number };
  /** Las claves tal como llegaron: lo que no debe existir se busca en el texto crudo. */
  texto: string;
  hasta: string;
  url: string;
}

/** Lo que el navegador pidio al servidor y lo que el servidor le contesto, en `/reportes`. */
class EscuchaDeReportes {
  readonly respuestas: ResumenCapturado[] = [];
  readonly urlsPedidas: string[] = [];

  constructor(page: Page) {
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/reportes/resumen')) this.urlsPedidas.push(r.url());
    });
    page.on('response', (r) => {
      if (!r.url().includes('/api/v1/reportes/resumen') || r.status() !== 200) return;
      // Una peticion que la pantalla cancela (cambio de periodo, recarga) ya no tiene cuerpo: no cuenta.
      void r
        .text()
        .then((texto) => {
          const json = JSON.parse(texto) as ResumenCapturado & { periodo: { hasta: string } };
          this.respuestas.push({ ...json, texto, hasta: json.periodo.hasta, url: r.url() });
        })
        .catch(() => undefined);
    });
  }

  /** La del periodo en curso: la pantalla pide tambien el anterior, que termina antes. */
  actual(): ResumenCapturado {
    expect(this.respuestas.length, 'el navegador no recibio ningun resumen').toBeGreaterThan(0);
    return [...this.respuestas].sort((a, b) => b.hasta.localeCompare(a.hasta))[0]!;
  }
}

async function sinDesborde(page: Page, donde: string): Promise<void> {
  const exceso = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(exceso, `desbordamiento horizontal ${donde}`).toBeLessThanOrEqual(0);
}

/** Entra por la pantalla de ingreso, como lo haria la persona. Devuelve su contexto, ya con sesion. */
async function sesionDe(
  browser: Browser,
  correo: string,
): Promise<{ contexto: BrowserContext; page: Page }> {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 844 },
    storageState: { cookies: [], origins: [] },
  });
  const page = await contexto.newPage();
  await ingresarPorPantalla(page, correo, credenciales().clave);
  return { contexto, page };
}

/** Abre /reportes y espera a que la pantalla termine de cargar. */
async function abrirReportes(page: Page): Promise<EscuchaDeReportes> {
  const escucha = new EscuchaDeReportes(page);
  await page.goto('/reportes');
  await expect(page.getByTestId('mis-numeros').or(page.getByTestId('reportes-reales'))).toBeVisible(
    { timeout: 30_000 },
  );
  // La respuesta se lee de forma asincrona: se espera a tenerla.
  await expect.poll(() => escucha.respuestas.length, { timeout: 10_000 }).toBeGreaterThan(0);
  return escucha;
}

/** «Abiertas (de las creadas en el periodo)» tal como la pinta «Mis numeros». */
async function abiertasPintadas(page: Page): Promise<number> {
  const fila = page
    .getByTestId('mn-oportunidades')
    .locator('dt', { hasText: /^Abiertas/ })
    .locator('xpath=following-sibling::dd[1]');
  return Number((await fila.innerText()).trim());
}

/** Crea `cuantas` oportunidades con la sesion de ese contexto: el servidor las atribuye a quien las crea. */
async function crearOportunidades(
  contexto: BrowserContext,
  cuantas: number,
  marca: string,
): Promise<void> {
  for (let i = 0; i < cuantas; i += 1) {
    const telefono = `+5731${String(randomInt(10_000_000, 99_999_999))}`;
    const contacto = await contexto.request.post(`${URL_API}/api/v1/crm/contactos`, {
      data: { telefono, nombre: `${marca} ${i + 1}` },
    });
    expect(contacto.status(), `crear contacto de ${marca}`).toBeLessThan(300);
    const { id } = (await contacto.json()) as { id: string };
    const oportunidad = await contexto.request.post(`${URL_API}/api/v1/crm/oportunidades`, {
      data: { contactoId: id, titulo: `${marca} viaje ${i + 1}` },
    });
    expect(oportunidad.status(), `crear oportunidad de ${marca}`).toBeLessThan(300);
  }
}

let ana: { contexto: BrowserContext; page: Page };
let carlos: { contexto: BrowserContext; page: Page };
let carlosId = '';
const antes = { ana: 0, carlos: 0, agencia: 0 };

test.beforeAll(async ({ browser }) => {
  // Si el limitador de ingresos (5/min por IP, compartido con 01 y 08) esta lleno, se espera a que
  // se libere: hasta ~80 s la primera vez. El tope por defecto de 90 s no alcanzaria para los dos.
  test.setTimeout(180_000);
  ana = await sesionDe(browser, CORREO_ANA);
  carlos = await sesionDe(browser, CORREO_CARLOS);
});

test.afterAll(async () => {
  await ana?.contexto.close();
  await carlos?.contexto.close();
});

test('la prueba parte de dos asesores y la agencia con cifras que se pueden distinguir', async ({
  page,
}) => {
  // Lo que cada uno ve antes de que se cree nada (la diferencia es lo que se afirma despues).
  const deAna = await abrirReportes(ana.page);
  expect(deAna.actual().alcance, 'Ana debe recibir el alcance propio').toBe('PROPIO');
  antes.ana = await abiertasPintadas(ana.page);

  const deCarlos = await abrirReportes(carlos.page);
  expect(deCarlos.actual().alcance).toBe('PROPIO');
  antes.carlos = await abiertasPintadas(carlos.page);

  const deLaDuena = await abrirReportes(page);
  expect(deLaDuena.actual().alcance, 'la duena (sesion del proyecto) ve la agencia').toBe(
    'AGENCIA',
  );
  antes.agencia = deLaDuena.actual().oportunidades?.creadas ?? 0;

  // El id de Carlos lo da el listado de miembros de la duena; el de Ana no hace falta.
  const miembros = await page.request.get(`${URL_API}/api/v1/identidad/miembros`);
  expect(miembros.status(), 'GET /api/v1/identidad/miembros').toBe(200);
  const lista = (await miembros.json()) as Array<{ id: string; correo: string }>;
  carlosId = lista.find((m) => m.correo.toLowerCase() === CORREO_CARLOS)?.id ?? '';
  expect(carlosId, `el equipo no trae a ${CORREO_CARLOS}`).not.toBe('');

  // Ahora si: cifras DISTINTAS, cada una con su propia sesion.
  await crearOportunidades(ana.contexto, OPORTUNIDADES_DE_ANA, 'e2e-alcance-ana');
  await crearOportunidades(carlos.contexto, OPORTUNIDADES_DE_CARLOS, 'e2e-alcance-carlos');
});

test('Ana ve «Mis numeros» con SUS cifras y nada de la agencia ni de Carlos', async () => {
  const { page } = ana;
  const escucha = await abrirReportes(page);

  await expect(page.getByRole('heading', { name: 'Mis números', level: 1 })).toBeVisible();
  await expect(page.getByTestId('mis-numeros')).toBeVisible();

  // Sus cifras: las dos oportunidades que creo, ni una de Carlos.
  expect(await abiertasPintadas(page), 'Ana debe ver exactamente lo suyo').toBe(
    antes.ana + OPORTUNIDADES_DE_ANA,
  );

  // Nada de la vista de agencia: ni el selector, ni el dashboard, ni la comparacion de asesores.
  await expect(page.getByTestId('reportes-ambito')).toHaveCount(0);
  await expect(page.getByTestId('reportes-reales')).toHaveCount(0);
  await expect(page.getByTestId('dashboard-administracion')).toHaveCount(0);
  await expect(page.getByTestId('bloque-asesores')).toHaveCount(0);
  await expect(page.getByTestId('fila-asesor')).toHaveCount(0);
  await expect(page.getByTestId('tarjetas-asesores')).toHaveCount(0);
  await expect(page.getByText('Toda la agencia')).toHaveCount(0);

  // Ni el nombre del companero ni el de la duena aparecen en la pantalla.
  const cuerpo = await page.locator('body').innerText();
  expect(cuerpo).not.toContain(NOMBRE_CARLOS);
  expect(cuerpo).not.toContain('John');

  // Lo que dijo el SERVIDOR: alcance propio y las claves de agencia ni existen en el texto crudo.
  const respuesta = escucha.actual();
  expect(respuesta.alcance).toBe('PROPIO');
  expect(respuesta.texto, 'el servidor no debe mandarle la comparacion entre asesores').not.toMatch(
    /porAsesor|ventasPorDestino/,
  );
  // Y lo pintado es lo que el servidor mando (la pantalla no recorta ni suma por su cuenta).
  expect(await abiertasPintadas(page)).toBe(respuesta.oportunidades?.abiertas);

  // La pantalla nunca pide a nadie mas: sin `asesorId`, o con `yo`.
  for (const url of escucha.urlsPedidas) {
    const pedido = new URL(url).searchParams.get('asesorId');
    expect(pedido === null || pedido === 'yo', `asesorId pedido: ${pedido}`).toBe(true);
  }

  await sinDesborde(page, 'en «Mis numeros»');
});

test('Ana no puede pedir las cifras de Carlos aunque lo intente a mano: el servidor responde 403', async () => {
  const { page } = ana;
  await page.goto('/reportes');
  const respuesta = await page.evaluate(
    async ({ api, id }) => {
      const hasta = new Date(Date.now() + 24 * 3600_000).toISOString();
      const desde = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
      const pedir = async (asesorId: string) => {
        const r = await fetch(
          `${api}/api/v1/reportes/resumen?${new URLSearchParams({ desde, hasta, asesorId })}`,
          { credentials: 'include' },
        );
        return { estado: r.status, texto: await r.text() };
      };
      return { ajeno: await pedir(id), propio: await pedir('yo') };
    },
    { api: URL_API, id: carlosId },
  );

  // El ajeno se rechaza (no se recorta en silencio) y no trae ninguna cifra.
  expect(respuesta.ajeno.estado, 'asesorId de Carlos pedido por Ana').toBe(403);
  expect(respuesta.ajeno.texto).not.toMatch(/oportunidades|ventasPorMoneda|porAsesor/);
  // `yo` si: es ella.
  expect(respuesta.propio.estado).toBe(200);
  expect(respuesta.propio.texto).toContain('"alcance":"PROPIO"');
});

test('Carlos ve lo suyo, que no es lo de Ana', async () => {
  const { page } = carlos;
  const escucha = await abrirReportes(page);

  await expect(page.getByRole('heading', { name: 'Mis números', level: 1 })).toBeVisible();
  const suyas = await abiertasPintadas(page);
  expect(suyas, 'Carlos debe ver exactamente lo suyo').toBe(antes.carlos + OPORTUNIDADES_DE_CARLOS);
  expect(escucha.actual().alcance).toBe('PROPIO');

  // Distintas de las de Ana: si el servidor mezclara asesores, las dos cifras coincidirian o
  // contendrian la del otro.
  const deAna = antes.ana + OPORTUNIDADES_DE_ANA;
  expect(suyas - antes.carlos).not.toBe(deAna - antes.ana);

  await expect(page.getByTestId('dashboard-administracion')).toHaveCount(0);
  expect(await page.locator('body').innerText()).not.toContain(NOMBRE_ANA);
  await sinDesborde(page, 'en «Mis numeros» de Carlos');
});

test('la duena ve toda la agencia: el dashboard de administracion y a los dos asesores', async ({
  page,
}) => {
  const escucha = await abrirReportes(page);
  const respuesta = escucha.actual();

  expect(respuesta.alcance).toBe('AGENCIA');
  await expect(page.getByTestId('mis-numeros')).toHaveCount(0);
  await expect(page.getByTestId('reportes-ambito')).toBeVisible();
  await expect(page.getByTestId('dashboard-administracion')).toBeVisible({ timeout: 30_000 });

  // Lo de TODA la agencia incluye lo de los dos (y lo que ya hubiera).
  const agregado = (respuesta.oportunidades?.creadas ?? 0) - antes.agencia;
  expect(
    agregado,
    'la agencia debe contar las oportunidades de los dos asesores',
  ).toBeGreaterThanOrEqual(OPORTUNIDADES_DE_ANA + OPORTUNIDADES_DE_CARLOS);
  expect(respuesta.texto).toContain('porAsesor');

  // La comparacion nombra a los dos: una tabla en pantallas anchas, tarjetas a 390 px.
  const asesores = page.getByTestId('bloque-asesores');
  await expect(asesores).toBeVisible({ timeout: 30_000 });
  await expect(asesores).toContainText(NOMBRE_ANA);
  await expect(asesores).toContainText(NOMBRE_CARLOS);

  await sinDesborde(page, 'en el dashboard de administracion');
});
