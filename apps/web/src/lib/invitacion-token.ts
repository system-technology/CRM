/**
 * Lectura segura del token de invitación desde el fragmento de la URL (`#token=...`)
 * y cliente para `POST /api/v1/auth/invitaciones/aceptar` (ADR-0011, T-092, T-112).
 *
 * Reglas de seguridad:
 * - El token viaja únicamente en `location.hash` para no enviarse al servidor en la petición GET
 *   de la página, ni registrarse en logs de acceso ni filtrarse en cabeceras `Referer`.
 * - En cuanto la página lo lee en el cliente, lo borra inmediatamente de la barra de direcciones
 *   mediante `history.replaceState`.
 * - Nunca se escribe el valor del token en `console.*`, errores ni telemetría.
 * - Contrato validado con `AceptarInvitacion` y `RespuestaOk` de `@viajapro/contracts` (R3).
 */

import {
  AceptarInvitacion as EsquemaAceptarInvitacion,
  type AceptarInvitacion as AceptarInvitacionTipo,
  RespuestaOk as EsquemaRespuestaOk,
  ErrorApi as EsquemaErrorApi,
} from '@viajapro/contracts';
import { obtenerBaseApi } from './api-base';

export type EstadoAceptarInvitacion =
  'token_ausente' | 'formulario' | 'enviando' | 'exito' | 'invalido_o_vencido' | 'error_red';

export type ResultadoAceptarInvitacion =
  | { estado: 'exito' }
  | {
      estado: 'invalido_o_vencido';
      codigo: string;
      mensaje: string;
      queHacer: string;
    }
  | {
      estado: 'error_red';
      codigo: string;
      mensaje: string;
      queHacer: string;
    };

export interface UbicacionMinima {
  readonly hash: string;
  readonly pathname: string;
  readonly search: string;
}

export interface HistorialMinimo {
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/**
 * Extrae de forma pura el valor de `token` desde una cadena `location.hash` (p. ej. `#token=abc...`).
 * Devuelve `null` si el fragmento está vacío o no contiene el parámetro `token` con contenido.
 */
export function extraerTokenDeFragmento(hash: string | null | undefined): string | null {
  if (!hash || typeof hash !== 'string') {
    return null;
  }

  const limpio = hash.startsWith('#') ? hash.slice(1).trim() : hash.trim();
  if (!limpio) {
    return null;
  }

  try {
    const params = new URLSearchParams(limpio);
    const valor = params.get('token')?.trim() ?? '';
    return valor.length > 0 ? valor : null;
  } catch {
    // Fallback manual por si hubiera una secuencia % malformada en otro parámetro
    const partes = limpio.split('&');
    for (const parte of partes) {
      const [clave, ...resto] = parte.split('=');
      if (clave?.trim() === 'token') {
        const crudo = resto.join('=').trim();
        if (!crudo) return null;
        try {
          const decodificado = decodeURIComponent(crudo).trim();
          return decodificado.length > 0 ? decodificado : null;
        } catch {
          return crudo;
        }
      }
    }
    return null;
  }
}

/**
 * Comprueba si el token extraído cumple las cotas de longitud del contrato `AceptarInvitacion`
 * (entre 20 y 200 caracteres, sin revelar nunca el valor del token).
 */
export function esFormatoTokenInvitacionValido(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  const limpio = token.trim();
  return limpio.length >= 20 && limpio.length <= 200;
}

/**
 * Lee el token desde `ubicacion.hash` y, si había cualquier fragmento en la URL, lo limpia de
 * inmediato con `historial.replaceState` conservando únicamente `pathname + search`.
 */
export function consumirTokenDeUrl(
  ubicacion?: UbicacionMinima,
  historial?: HistorialMinimo,
): string | null {
  const loc: UbicacionMinima | undefined =
    ubicacion ?? (typeof window !== 'undefined' ? window.location : undefined);
  const hist: HistorialMinimo | undefined =
    historial ?? (typeof window !== 'undefined' ? window.history : undefined);

  if (!loc) {
    return null;
  }

  const token = extraerTokenDeFragmento(loc.hash);

  if (loc.hash && loc.hash.length > 0 && hist && typeof hist.replaceState === 'function') {
    const urlSinFragmento = `${loc.pathname || '/'}${loc.search || ''}`;
    hist.replaceState(null, '', urlSinFragmento);
  }

  return token;
}

/**
 * Envía la aceptación de la invitación a `POST /api/v1/auth/invitaciones/aceptar`.
 * El token viaja exclusivamente en el cuerpo JSON con `referrerPolicy: 'no-referrer'`.
 */
export async function aceptarInvitacionApi(
  entrada: AceptarInvitacionTipo,
  fetchFn: typeof fetch = fetch,
): Promise<ResultadoAceptarInvitacion> {
  if (!esFormatoTokenInvitacionValido(entrada.token)) {
    return {
      estado: 'invalido_o_vencido',
      codigo: 'INVITACION_INVALIDA',
      mensaje: 'El enlace de invitación no es válido, ya fue utilizado o ha caducado.',
      queHacer:
        'Solicita al administrador o dueño de tu agencia que te envíe una nueva invitación por correo.',
    };
  }

  const validacion = EsquemaAceptarInvitacion.safeParse({
    token: entrada.token.trim(),
    nombre: entrada.nombre.trim(),
    contrasena: entrada.contrasena,
  });

  if (!validacion.success) {
    return {
      estado: 'invalido_o_vencido',
      codigo: 'DATOS_INVALIDOS',
      mensaje:
        'Revisa que tu nombre esté completo y que la contraseña tenga al menos 12 caracteres.',
      queHacer: 'Corrige los campos del formulario e inténtalo de nuevo.',
    };
  }

  let respuesta: Response;
  try {
    respuesta = await fetchFn(`${obtenerBaseApi()}/api/v1/auth/invitaciones/aceptar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      referrerPolicy: 'no-referrer',
      body: JSON.stringify(validacion.data),
    });
  } catch {
    return {
      estado: 'error_red',
      codigo: 'ERROR_CONEXION',
      mensaje: 'No pudimos conectar con el servidor de ViajaPro para activar tu cuenta.',
      queHacer:
        'Verifica tu conexión a internet y pulsa «Reintentar». Tu invitación sigue lista en esta ventana.',
    };
  }

  if (respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => null)) as unknown;
    const okValidado = EsquemaRespuestaOk.safeParse(cuerpo);
    if (okValidado.success) {
      return { estado: 'exito' };
    }
    return {
      estado: 'error_red',
      codigo: 'RESPUESTA_INVALIDA',
      mensaje: 'El servidor devolvió una respuesta inesperada al procesar tu invitación.',
      queHacer: 'Intenta activar tu cuenta nuevamente en unos segundos.',
    };
  }

  if (respuesta.status >= 500 || respuesta.status === 429) {
    return {
      estado: 'error_red',
      codigo: respuesta.status === 429 ? 'DEMASIADOS_INTENTOS' : 'ERROR_SERVIDOR',
      mensaje:
        respuesta.status === 429
          ? 'Has realizado demasiados intentos seguidos. Espera un minuto antes de reintentar.'
          : 'El servicio de activación no está disponible temporalmente.',
      queHacer: 'Espera unos instantes y vuelve a pulsar «Reintentar».',
    };
  }

  // Errores 4xx (400 INVITACION_INVALIDA, 404, 410, 422): token inválido, usado o vencido
  const cuerpoError = (await respuesta.json().catch(() => null)) as unknown;
  const errorParseado = EsquemaErrorApi.safeParse(cuerpoError);
  const codigo = errorParseado.success ? errorParseado.data.error.code : 'INVITACION_INVALIDA';

  return {
    estado: 'invalido_o_vencido',
    codigo,
    mensaje:
      'Esta invitación no es válida, ya fue aceptada anteriormente o superó las 72 horas de vigencia.',
    queHacer:
      'Pide al dueño o administrador de la agencia que te envíe una nueva invitación desde Configuración → Equipo.',
  };
}
