/**
 * El puerto por el que `shared/` (el middleware de tenant) le pide a `identity` quién llama.
 * R4 y ADR-0004.
 *
 * El middleware vive en `shared/` porque cubre TODAS las rutas, pero la verdad sobre la sesión
 * es de `identity`: ella sabe de cookies, de Better Auth y del pool de identidad. Este símbolo
 * deja que el middleware pregunte sin importarla, y que `identity` lo implemente y lo registre.
 *
 * Es una clase abstracta y no una interfaz: Nest necesita un símbolo en ejecución para inyectar.
 *
 * **Lo que devuelve ya está validado.** `concedido` significa que se cumplieron los pasos 3 y 4
 * del flujo de ADR-0011: la sesión existe y no está revocada, y la identidad pertenece a la
 * agencia activa bajo RLS, activa, y la agencia no está suspendida. El llamador no repite nada.
 * El mismo puerto lo usará el socket (handshake y revalidación periódica).
 */
import type { Permiso } from '@viajapro/contracts';

/**
 * Sufijo del nombre de la cookie de sesión (`<prefijo>.session_token`). Better Auth la nombra así
 * y `crear-auth.ts` fija el prefijo. Está aquí porque el middleware necesita saber si una petición
 * TRAE una sesión, aunque ya no valga, sin importar a `identity`.
 */
export const SUFIJO_DE_COOKIE_DE_SESION = '.session_token';

/** ¿La cabecera `Cookie` presenta una sesión (válida o no)? */
export function presentaCookieDeSesion(cookie: string | null | undefined): boolean {
  if (!cookie) return false;
  return cookie
    .split(';')
    .some((par) => (par.split('=')[0] ?? '').trim().endsWith(SUFIJO_DE_COOKIE_DE_SESION));
}

export interface EntradaDeAcceso {
  /** El valor de la cabecera `Cookie`, tal cual llegó. Nulo si no vino. */
  cookie: string | null;
}

export interface AccesoConcedido {
  tenantId: string;
  usuarioId: string;
  identidadId: string;
  sesionId: string;
  /** Nombre del rol en esa agencia, para mostrar. No decide nada: deciden los permisos. */
  rol: string;
  permisos: ReadonlySet<Permiso>;
}

export type MotivoDeNegacion =
  'SIN_SESION' | 'SIN_AGENCIA_ACTIVA' | 'ACCESO_REVOCADO' | 'AGENCIA_SUSPENDIDA';

export type ResultadoDeAcceso =
  | {
      concedido: true;
      acceso: AccesoConcedido;
      /** `Set-Cookie` que Better Auth quiere emitir (renovación de la sesión). Reenviarlos. */
      cookies: readonly string[];
    }
  | { concedido: false; motivo: MotivoDeNegacion; cookies: readonly string[] };

export abstract class ResolutorDeAcceso {
  abstract resolver(entrada: EntradaDeAcceso): Promise<ResultadoDeAcceso>;
}
