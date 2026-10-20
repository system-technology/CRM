/**
 * Cómo se guarda el token de sesión: **hasheado**, nunca en claro (ADR-0011, condición del
 * auditor de seguridad, bloqueante).
 *
 * **Por qué.** La tabla `sesiones` es global y contiene la sesión viva de todas las agencias.
 * Si el token estuviera en claro, quien leyera la tabla —una copia de seguridad, una consulta
 * mal filtrada, un volcado— podría suplantar a cualquiera sin conocer ninguna contraseña. Con
 * el hash, la fila no sirve para entrar: el token real solo existe en la cookie del navegador.
 *
 * **Por qué SHA-256 y sin sal.** El token es una cadena aleatoria de 32 caracteres generada por
 * Better Auth: tiene entropía de sobra, así que no hay diccionario que atacar y la sal no
 * aporta nada. Hace falta que el hash sea determinista, porque se busca la sesión por él en
 * cada petición.
 *
 * **Qué hace Better Auth y qué no.** Better Auth no hashea el token de sesión de forma nativa
 * (sí el OTP del plugin Email OTP, con `storeOTP: 'hashed'`; ver `crear-auth.ts`). Se
 * resuelve en el adaptador de base de datos, ver `adaptador-con-token-hasheado.ts`.
 */
import { createHash } from 'node:crypto';

/** Prefijo que marca un valor como hash. Un token en claro nunca lo lleva (es alfanumérico). */
export const PREFIJO_DE_TOKEN_HASHEADO = 'sha256:';

export function hashearTokenDeSesion(tokenEnClaro: string): string {
  return (
    PREFIJO_DE_TOKEN_HASHEADO + createHash('sha256').update(tokenEnClaro, 'utf8').digest('hex')
  );
}
