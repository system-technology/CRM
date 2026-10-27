/**
 * Envío REAL por la WhatsApp Cloud API: `POST {base}/{versión}/{phone_number_id}/messages` con
 * `fetch`, sin SDK (ADR-0018). Mismo patrón que `correo.postmark.ts`.
 *
 * - **Timeout por intento** (10 s): un `fetch` sin tope deja el trabajo colgado y la reserva puesta.
 * - **Reintentos con espera creciente DENTRO del adaptador, pocos y solo cuando es seguro**: Meta
 *   respondió y dijo que NO lo aceptó (429 / 5xx / códigos transitorios), o la conexión ni siquiera
 *   se abrió (DNS, conexión rechazada). Los reintentos largos (minutos) son de la cola BullMQ.
 * - **Un timeout o una conexión cortada a medias NO se reintentan**: la petición pudo llegar y Meta
 *   pudo enviarlo. Se lanza `EnvioSinConfirmarError` y el webhook de estado, correlacionado por
 *   `biz_opaque_callback_data`, dice la verdad después. Reintentar ahí es como se duplica (R5).
 * - **Un 5xx SIN el código de error de Meta tampoco se reintenta**: un 502/504 del borde o de un
 *   proxy no dice que Meta lo rechazara; la petición pudo llegar. Solo un 5xx que trae `error.code`
 *   es Meta diciendo «no lo acepté», y ese sigue la tabla de `errorDeMeta`.
 * - Sin redirecciones (`redirect: 'error'`: la Graph API no redirige, y seguir una reenviaría el
 *   token) y con tope de bytes al leer la respuesta.
 * - **Nada del token, del destinatario ni del texto sale de aquí en un error ni en un log.** De la
 *   respuesta de error solo se lee `error.code` (número); `message` y `error_data.details` de Meta
 *   pueden repetir el número del viajero (R10).
 *
 * Forma de la petición y de la respuesta: `docs/04-integraciones/01-whatsapp-cloud-api.md` §6.1 y
 * §9; `biz_opaque_callback_data` verificado en la referencia del webhook de estado (2026-10-26).
 */
import {
  type ErrorDeEnvioWhatsapp,
  EnvioSinConfirmarError,
  MetaInalcanzableError,
  errorDeMeta,
} from '../domain/errores-de-envio.js';
import { type PedidoDeTexto, PuertoEnvioWhatsapp } from '../application/puertos-de-envio.js';

export const TIMEOUT_DE_GRAPH_MS = 10_000;
/** Versión por omisión: la vigente según §0 de la integración. Se sobrescribe con `META_GRAPH_VERSION`. */
export const VERSION_DE_GRAPH = 'v26.0';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export interface OpcionesDeGraph {
  /** `https://graph.facebook.com` en producción; un servidor local en las pruebas. */
  baseUrl: string;
  version?: string;
  timeoutMs?: number;
  /** Reintentos dentro del adaptador, además del primer intento. */
  reintentos?: number;
  /** Primera espera; cada reintento la triplica (0,5 s → 1,5 s → 4,5 s). */
  esperaBaseMs?: number;
  fetch?: Fetch;
  dormir?: (ms: number) => Promise<void>;
}

/** Errores de red que garantizan que la petición NO salió. Todo lo demás es «quizá salió». */
const NO_SALIO = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH']);

function codigoDeRed(error: unknown): string | null {
  const causa = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof causa?.code === 'string' ? causa.code : null;
}

/** Tope de bytes de una respuesta de la Graph API: las de `/messages` ocupan unos cientos. */
export const TOPE_DE_RESPUESTA_BYTES = 64 * 1024;

/**
 * El cuerpo como JSON, leyendo como mucho `TOPE_DE_RESPUESTA_BYTES`. `null` si no hay cuerpo, si
 * excede el tope, si la lectura falla (timeout, conexión cortada) o si no es JSON.
 */
async function leerJsonAcotado(respuesta: Response): Promise<unknown> {
  if (respuesta.body === null) return null;
  const lector: ReadableStreamDefaultReader<Uint8Array> = respuesta.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.byteLength;
      if (total > TOPE_DE_RESPUESTA_BYTES) {
        await lector.cancel().catch(() => undefined);
        return null;
      }
      trozos.push(value);
    }
    return JSON.parse(Buffer.concat(trozos).toString('utf8')) as unknown;
  } catch {
    // Sin cuerpo legible o no JSON (la página de un proxy): no hay nada que leer.
    return null;
  }
}

async function leerCodigoDeMeta(respuesta: Response): Promise<number | null> {
  const cuerpo = await leerJsonAcotado(respuesta);
  const error = (cuerpo as { error?: { code?: unknown } } | null)?.error;
  return typeof error?.code === 'number' ? error.code : null;
}

async function leerWamid(respuesta: Response): Promise<string | null> {
  const cuerpo = await leerJsonAcotado(respuesta);
  const mensajes = (cuerpo as { messages?: unknown } | null)?.messages;
  const id = Array.isArray(mensajes) ? (mensajes[0] as { id?: unknown } | undefined)?.id : null;
  return typeof id === 'string' && id.length > 0 && id.length <= 128 ? id : null;
}

export class EnvioWhatsappGraph extends PuertoEnvioWhatsapp {
  private readonly peticion: Fetch;
  private readonly dormir: (ms: number) => Promise<void>;

  /** `@inyeccion-manual`: lo construye `crearEnvioWhatsapp`, no el inyector de Nest. */
  constructor(private readonly opciones: OpcionesDeGraph) {
    super();
    this.peticion = opciones.fetch ?? ((url, init) => fetch(url, init));
    this.dormir = opciones.dormir ?? ((ms) => new Promise((resolver) => setTimeout(resolver, ms)));
  }

  async enviarTexto(pedido: PedidoDeTexto): Promise<{ wamid: string }> {
    const reintentos = this.opciones.reintentos ?? 2;
    const espera = this.opciones.esperaBaseMs ?? 500;
    let ultimo: ErrorDeEnvioWhatsapp | null = null;
    for (let intento = 0; intento <= reintentos; intento += 1) {
      if (intento > 0) await this.dormir(espera * 3 ** (intento - 1));
      try {
        return await this.unIntento(pedido);
      } catch (error) {
        const e = error as ErrorDeEnvioWhatsapp;
        if (!e.reintentable) throw e;
        ultimo = e;
      }
    }
    // Agotados los reintentos cortos: la cola decide si vuelve a intentarlo más tarde.
    throw ultimo ?? new MetaInalcanzableError();
  }

  private async unIntento(pedido: PedidoDeTexto): Promise<{ wamid: string }> {
    const { baseUrl, version = VERSION_DE_GRAPH, timeoutMs = TIMEOUT_DE_GRAPH_MS } = this.opciones;
    const url = `${baseUrl.replace(/\/+$/, '')}/${version}/${encodeURIComponent(
      pedido.credencial.phoneNumberId,
    )}/messages`;

    let respuesta: Response;
    try {
      respuesta = await this.peticion(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pedido.credencial.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          // Meta lo pide en formato internacional sin `+` (así lo devuelve en los webhooks).
          to: pedido.para.replace(/^\+/, ''),
          type: 'text',
          text: { body: pedido.texto, preview_url: false },
          biz_opaque_callback_data: pedido.referencia,
        }),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'error',
      });
    } catch (error) {
      // Se descarta el error original: puede citar la URL o el cuerpo.
      if (NO_SALIO.has(codigoDeRed(error) ?? '')) throw new MetaInalcanzableError();
      throw new EnvioSinConfirmarError();
    }

    if (respuesta.ok) {
      const wamid = await leerWamid(respuesta);
      // 2xx sin `wamid` legible: Meta pudo aceptarlo. Sin confirmar, nunca reintentar.
      if (wamid === null) throw new EnvioSinConfirmarError();
      return { wamid };
    }
    const codigo = await leerCodigoDeMeta(respuesta);
    // 5xx sin el sobre de error de Meta (502/504 del borde, HTML de un proxy, cuerpo vacío): nada
    // dice que Meta lo rechazara y la petición pudo llegar. Sin confirmar, nunca reintentar (R5).
    if (codigo === null && respuesta.status >= 500) throw new EnvioSinConfirmarError();
    throw errorDeMeta(codigo, respuesta.status);
  }
}
