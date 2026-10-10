/**
 * El apretón de manos con el que Meta da de alta nuestro webhook.
 *
 * Meta hace un `GET` con tres parámetros y espera **el challenge en texto plano**. Si la
 * respuesta no es exactamente eso, la suscripción no se crea y no llega ni un mensaje — sin un
 * error que diga por qué, solo un webhook que nunca se activa.
 *
 * Contrato verificado en `docs/04-integraciones/01-whatsapp-cloud-api.md` §3:
 *
 * ```
 * GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=<nuestro>&hub.challenge=1158201444
 * → 200, Content-Type: text/plain, cuerpo: 1158201444
 * ```
 *
 * **El token de verificación no identifica a nadie.** Es uno solo, de la app, y lo inventamos
 * nosotros: sirve para que Meta demuestre que habla con quien configuró el webhook, no para
 * distinguir agencias. No se deriva ni se parametriza por tenant.
 */

import { timingSafeEqual } from 'node:crypto';

export type ResultadoSuscripcion =
  | { ok: true; challenge: string }
  | {
      ok: false;
      motivo: 'MODO_INVALIDO' | 'TOKEN_NO_COINCIDE' | 'FALTAN_PARAMETROS' | 'SIN_TOKEN';
    };

/**
 * Compara dos cadenas en tiempo constante.
 *
 * `timingSafeEqual` exige buffers del mismo largo, así que comparar longitudes antes filtraría
 * el tamaño del token. Se normaliza con un hash de longitud fija... pero aquí basta con algo más
 * simple y sin dependencias: se comparan los buffers rellenados al mismo largo, y la diferencia
 * de longitud se arrastra como un bit más del resultado.
 */
function igualesEnTiempoConstante(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  const largo = Math.max(ba.length, bb.length, 1);
  const pa = Buffer.alloc(largo);
  const pb = Buffer.alloc(largo);
  ba.copy(pa);
  bb.copy(pb);
  // El `&&` evalúa siempre los dos lados porque `timingSafeEqual` ya se ejecutó.
  return timingSafeEqual(pa, pb) && ba.length === bb.length;
}

export function verificarSuscripcion(
  parametros: Record<string, string | undefined>,
  tokenEsperado: string | undefined,
): ResultadoSuscripcion {
  // Sin token configurado no se puede verificar nada, y devolver el challenge «porque no hay con
  // qué comprobar» dejaría que cualquiera suscribiera su propio webhook al nuestro.
  if (!tokenEsperado) return { ok: false, motivo: 'SIN_TOKEN' };

  const modo = parametros['hub.mode'];
  const token = parametros['hub.verify_token'];
  const challenge = parametros['hub.challenge'];

  if (!modo || !token || !challenge) return { ok: false, motivo: 'FALTAN_PARAMETROS' };

  // Meta documenta que este valor es siempre `subscribe`. Comprobarlo es barato y evita
  // responder a una llamada que no es la que creemos.
  if (modo !== 'subscribe') return { ok: false, motivo: 'MODO_INVALIDO' };

  if (!igualesEnTiempoConstante(token, tokenEsperado)) {
    return { ok: false, motivo: 'TOKEN_NO_COINCIDE' };
  }

  return { ok: true, challenge };
}
