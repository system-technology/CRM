import { createHmac, randomBytes } from 'node:crypto';

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
