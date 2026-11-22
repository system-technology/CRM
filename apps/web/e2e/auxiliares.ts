import { createHmac, randomBytes } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

export const URL_API = process.env['E2E_API_URL'] ?? 'http://localhost:3333';
const ID_NUMERO_PRUEBA = process.env['META_PHONE_NUMBER_ID_PRUEBA'] ?? '100000000000077';
const ID_WABA_PRUEBA = process.env['META_WABA_ID_PRUEBA'] ?? '100000000000078';

/** Una variable obligatoria que falta es un fallo ruidoso, nunca una prueba omitida en silencio. */
export function exigirEnv(...nombres: string[]): string {
  for (const nombre of nombres) {
    const valor = process.env[nombre];
    if (valor) return valor;
  }
  throw new Error(
    `Falta la variable de entorno ${nombres.join(' o ')} para la prueba de navegador.`,
  );
}

export function credenciales(): { correo: string; clave: string } {
  return {
    correo: process.env['E2E_CORREO'] ?? 'dueno@agenciademo.test',
    clave: exigirEnv('E2E_CLAVE', 'IDENTIDAD_DEV_PASSWORD'),
  };
}

export interface MensajeEntrante {
  texto: string;
  /** wa_id del viajero (solo digitos, con indicativo de pais). */
  de: string;
  nombre: string;
  /** Con el mismo wamid se reenvia el MISMO mensaje (idempotencia). */
  wamid?: string;
}

/**
 * POST /webhooks/whatsapp firmado como lo firma Meta: HMAC-SHA256 del cuerpo en crudo con
 * META_APP_SECRET en `x-hub-signature-256`. Mismo metodo que `scripts/firmar-webhook-whatsapp.mjs`
 * y que `inbox-webhook.e2e-spec.ts`. `firmaValida: false` firma con otro secreto (debe dar 403).
 */
export async function enviarWebhookWhatsapp(
  mensaje: MensajeEntrante,
  opciones: { firmaValida?: boolean } = {},
): Promise<{ estado: number; wamid: string }> {
  const secreto =
    opciones.firmaValida === false ? 'secreto-equivocado' : exigirEnv('META_APP_SECRET');
  const wamid = mensaje.wamid ?? `wamid.E2E${randomBytes(8).toString('hex')}`;
  const cuerpo = Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: ID_WABA_PRUEBA,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550000000',
                  phone_number_id: ID_NUMERO_PRUEBA,
                },
                contacts: [{ profile: { name: mensaje.nombre }, wa_id: mensaje.de }],
                messages: [
                  {
                    from: mensaje.de,
                    id: wamid,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: mensaje.texto },
                    type: 'text',
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
    'utf8',
  );
  const firma = 'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');
  const respuesta = await fetch(new URL('/webhooks/whatsapp', URL_API), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
    body: cuerpo,
  });
  return { estado: respuesta.status, wamid };
}

/**
 * Webhook de ESTADO firmado, como el que Meta manda tras aceptar un saliente: `sent`, `delivered`,
 * `read` o `failed`. Es lo que pasa un mensaje de PENDIENTE a ENVIADO; la respuesta de la Graph
 * solo deja el wamid. En el CI la Graph es falsa y no lo manda: lo hace la prueba.
 */
export async function enviarEstadoWhatsapp(
  wamid: string,
  estado: 'sent' | 'delivered' | 'read',
  destinatario: string,
): Promise<number> {
  const cuerpo = Buffer.from(
    JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        {
          id: ID_WABA_PRUEBA,
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp',
                metadata: {
                  display_phone_number: '15550000000',
                  phone_number_id: ID_NUMERO_PRUEBA,
                },
                statuses: [
                  {
                    id: wamid,
                    status: estado,
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    recipient_id: destinatario,
                  },
                ],
              },
            },
          ],
        },
      ],
    }),
    'utf8',
  );
  const firma =
    'sha256=' + createHmac('sha256', exigirEnv('META_APP_SECRET')).update(cuerpo).digest('hex');
  const respuesta = await fetch(new URL('/webhooks/whatsapp', URL_API), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': firma },
    body: cuerpo,
  });
  return respuesta.status;
}

/** URL de la Graph API falsa (e2e/graph-falsa.mjs), la misma que la API recibe en META_GRAPH_BASE_URL. */
const URL_GRAPH_FALSA = process.env['GRAPH_FALSA_URL'] ?? 'http://127.0.0.1:4010';

export interface EnvioRegistradoPorGraph {
  para: string | null;
  tipo: string | null;
  texto: string | null;
  wamid: string;
}

/** Lo que la Graph falsa ha recibido hasta ahora. Si no responde, falla ruidosamente. */
export async function enviosRecibidosPorGraph(): Promise<EnvioRegistradoPorGraph[]> {
  const respuesta = await fetch(new URL('/_enviados', URL_GRAPH_FALSA));
  if (!respuesta.ok) throw new Error(`La Graph falsa respondio ${respuesta.status}`);
  return (await respuesta.json()) as EnvioRegistradoPorGraph[];
}

/** La pantalla de Hoy: lo que sigue a un ingreso que salio bien. */
const URL_DE_HOY = /^[^?#]*\/$/;

/** Lo que dice la pantalla de ingreso cuando el limitador por IP corta (429, DEMASIADOS_INTENTOS). */
const TEXTO_DEL_LIMITE = /Demasiados intentos/;

/**
 * Ingresa por la pantalla, como lo haria la persona, y NO se rompe porque el limitador de intentos
 * este lleno (T-592).
 *
 * El limitador de `/sign-in/email` es de Better Auth: 5 intentos por minuto **por IP**, no por
 * identidad (`INTENTOS_DE_INICIO_POR_MINUTO`). Todo el job `navegador` sale de la misma IP, asi que
 * los ingresos de 01 (2), 08 (3) y 09 (2) comparten un cupo de 5 por minuto. Que la suite quepa
 * depende de cuanto tarde el tramo 02-07: si tarda menos de un minuto desde 01, `ana@` recibe un 429
 * y la pantalla dice «Demasiados intentos fallidos». Es una carrera contra el reloj del servidor,
 * y la CONDICION que se espera es que el cupo se libere: se reintenta con pausas crecientes SOLO
 * ante ese aviso (cualquier otro rechazo falla de inmediato con lo que la pantalla dijo, para no
 * esconder un defecto real del ingreso). (Si un 429 consumiera cupo, reintentar con pausas de 5 s o mas lo alargaria poco: no hay ruta mas barata.)
 *
 * Deja a la persona en Hoy. Con `esperaMaximaMs` se acota cuanto se espera el cupo.
 */
export async function ingresarPorPantalla(
  page: Page,
  identificador: string,
  clave: string,
  esperaMaximaMs = 80_000,
): Promise<void> {
  const aviso = page.getByRole('alert').filter({ hasText: /\S/ });
  const resultado: { rechazo: string | null } = { rechazo: null };
  let intentos = 0;

  await expect(async () => {
    intentos += 1;
    // Pantalla limpia en cada intento: un aviso viejo se leeria como la respuesta del intento nuevo.
    await page.goto('/ingresar');
    await page.locator('#campo-identificador').fill(identificador);
    await page.locator('#campo-contrasena').fill(clave);
    await page.getByRole('button', { name: /Ingresar a ViajaPro/ }).click();
    // Se espera el RESULTADO, no un tiempo: o se llega a Hoy o la pantalla dice por que no.
    await expect
      .poll(
        async () =>
          URL_DE_HOY.test(page.url())
            ? 'dentro'
            : (await aviso.count()) > 0
              ? 'aviso'
              : 'esperando',
        {
          timeout: 20_000,
          message: `el ingreso de ${identificador} no termino: ni llego a Hoy ni mostro un aviso`,
        },
      )
      .not.toBe('esperando');
    if (URL_DE_HOY.test(page.url())) return;
    const texto = await aviso.first().innerText({ timeout: 2_000 });
    if (TEXTO_DEL_LIMITE.test(texto)) {
      throw new Error(`limite de intentos de ingreso: ${texto.replace(/\s+/g, ' ')}`);
    }
    resultado.rechazo = texto.replace(/\s+/g, ' ');
  })
    .toPass({ timeout: esperaMaximaMs, intervals: [1_000, 5_000, 10_000, 15_000] })
    .catch((e: unknown) => {
      throw new Error(
        `No se pudo ingresar con ${identificador} tras ${intentos} intento(s). ${e instanceof Error ? e.message : String(e)}`,
      );
    });

  if (resultado.rechazo !== null) {
    throw new Error(
      `No se pudo ingresar con ${identificador}. La pantalla dijo: ${resultado.rechazo}`,
    );
  }
}
