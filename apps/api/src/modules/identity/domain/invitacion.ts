/**
 * La invitación a una agencia (ADR-0011, rebanada 4): token de un solo uso, con caducidad, que
 * se guarda HASHEADO.
 *
 * **Por qué el token no se guarda.** Quien lea la tabla (una copia, un volcado, una consulta mal
 * filtrada) no debe poder aceptar invitaciones ajenas y quedarse dentro de una agencia. Igual que
 * el token de sesión, el valor real solo existe en el correo que recibe la persona; en la base
 * queda su SHA-256. 32 bytes aleatorios tienen entropía de sobra: la sal no aporta nada y hace
 * falta un hash determinista para buscar por él.
 */
import { createHash, randomBytes } from 'node:crypto';

/** 72 horas (ADR-0012: el proveedor retiene el contenido). Una puerta abierta no se deja abierta. */
export const VIGENCIA_DE_INVITACION_MS = 72 * 60 * 60 * 1000;

/** Lo que se guarda de una invitación, sin el token. El tenant sale del SERVIDOR, no del cliente. */
export interface DatosDeInvitacion {
  tenantId: string;
  correo: string;
  rolId: string;
  /** El usuario que invitó. Nulo solo con el atajo de desarrollo, que no tiene usuario. */
  invitadoPorUsuarioId: string | null;
}

export function generarTokenDeInvitacion(): string {
  return randomBytes(32).toString('base64url');
}

export function hashearTokenDeInvitacion(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Clave de idempotencia del correo: un token da un correo, pida quien pida. */
export function claveDeCorreoDeInvitacion(hashDelToken: string): string {
  return `invitacion-${hashDelToken.slice(0, 32)}`;
}

export function enlaceDeInvitacion(urlDeLaWeb: string, token: string): string {
  const base = urlDeLaWeb.replace(/\/+$/, '');
  return `${base}/aceptar-invitacion?token=${encodeURIComponent(token)}`;
}
