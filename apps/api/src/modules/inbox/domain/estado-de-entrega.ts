/**
 * La máquina de estados de un mensaje SALIENTE, tal como la mueven los webhooks de estado de Meta.
 *
 * Lógica pura. Tres reglas, y las tres existen porque Meta las hace necesarias
 * (`docs/04-integraciones/01-whatsapp-cloud-api.md` §5.4 y §6):
 *
 *   1. **Solo avanza.** Los webhooks llegan desordenados: un `sent` que se procesa después de un
 *      `read` no puede devolver el mensaje a «enviado».
 *   2. **`FALLIDO` es terminal y gana siempre**, incluso sobre `LEIDO`: Meta documenta que un mismo
 *      mensaje puede emitir `delivered` y `failed`, y es peor mostrar «entregado» sobre algo que no
 *      llegó que mostrar un fallo.
 *   3. **Mientras no conocemos el `wamid`, nuestro estado es una suposición.** Si el envío terminó
 *      sin respuesta de Meta (timeout), el mensaje se marca `FALLIDO` «sin confirmar»; si después
 *      llega un estado de Meta que lo identifica por `biz_opaque_callback_data`, la verdad de Meta
 *      sustituye a nuestra suposición, sea cual sea. Ver ADR-0018 §4.
 */
import type { EstadoMensaje } from './contenido-del-cambio.js';

const RANGO: Record<Exclude<EstadoMensaje, 'FALLIDO'>, number> = {
  PENDIENTE: 0,
  ENVIADO: 1,
  ENTREGADO: 2,
  LEIDO: 3,
  REPRODUCIDO: 4,
};

/**
 * El estado que queda tras un reporte de Meta, o `null` si el reporte no cambia nada.
 *
 * `wamidConocido` es si el mensaje ya tiene guardado el `wamid` que devolvió Meta. Cuando es
 * `false` —el reporte llegó correlacionado por nuestro id—, el reporte manda sin más (regla 3).
 */
export function estadoTrasReporte(
  actual: EstadoMensaje,
  reportado: EstadoMensaje,
  wamidConocido: boolean,
): EstadoMensaje | null {
  if (!wamidConocido) return reportado === actual ? null : reportado;
  if (actual === 'FALLIDO') return null;
  if (reportado === 'FALLIDO') return 'FALLIDO';
  return RANGO[reportado] > RANGO[actual] ? reportado : null;
}
