/**
 * Huella de estado (ADR-0017 §4.2): lo que la persona vio al previsualizar.
 *
 * `informe.huella` solo cubre la propuesta. Esta cubre además lo que el catálogo de la agencia
 * hace con ella (qué se crea, qué cambia de precio, qué no se toca): si alguien modifica el
 * catálogo entre previsualizar y confirmar, el plan cambia y la huella también. Confirmar la
 * recalcula dentro del bloqueo y la compara.
 */

import { createHash } from 'node:crypto';
import type { InformeDeCatalogo } from '@viajapro/contracts';

export function huellaDeEstado(informe: InformeDeCatalogo): string {
  const plan = JSON.stringify({
    resumen: informe.resumen,
    elementos: informe.elementos.map((e) => [e.nivel, e.codigo, e.ruta, e.mensaje]),
    noIncluidos: informe.noIncluidos.map((n) => [n.codigo, n.nombre]),
  });
  return createHash('sha256').update(`${informe.huella}|${plan}`).digest('hex');
}

/** Con nada que crear ni actualizar, aplicar no escribe: reintentar es seguro aunque el estado cambiara. */
export function estaConvergido(informe: InformeDeCatalogo): boolean {
  return informe.resumen.creados === 0 && informe.resumen.actualizados === 0;
}
