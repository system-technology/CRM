/**
 * La clave de idempotencia del envío de una cotización (R5): derivada de conversación + cotización
 * + versión, con el tenant como sal. Determinista: el mismo envío repetido (doble clic, reintento
 * de red) produce la misma clave y, por la unicidad `(tenant, clave)`, un solo mensaje.
 *
 * Tiene forma de UUID porque la columna `mensajes.clave_idempotencia` es `uuid`. No es un secreto:
 * solo evita duplicados.
 */
import { createHash } from 'node:crypto';

export function claveDeEnvioDeCotizacion(e: {
  tenantId: string;
  conversacionId: string;
  cotizacionId: string;
  version: number;
}): string {
  const h = createHash('sha256')
    .update(`cotizacion-whatsapp|${e.tenantId}|${e.conversacionId}|${e.cotizacionId}|${e.version}`)
    .digest('hex');
  // Versión 5 y variante RFC 4122, como un UUID derivado por nombre.
  const variante = ((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variante}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
