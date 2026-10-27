/**
 * Huella de estado (ADR-0017 §4.2): lo que la persona vio al previsualizar.
 *
 * `informe.huella` solo cubre la propuesta. Esta cubre además el estado del catálogo de la agencia
 * sobre el que se planificó (paquetes, vigencias y tarifas con sus precios) y el plan resultante:
 * si alguien modifica el catálogo entre previsualizar y confirmar, la huella cambia. Confirmar la
 * recalcula dentro del bloqueo y la compara. Es un hash: no revela nada del catálogo.
 */

import { createHash } from 'node:crypto';
import type { InformeDeCatalogo } from '@viajapro/contracts';
import { type CatalogoActual, normalizarNombre } from './validar-y-planificar.js';

const porTexto = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** El catálogo en un orden estable: `leer` no ordena las tarifas y el hash no debe depender de eso. */
function instantanea(actual: CatalogoActual): unknown {
  return [...actual.paquetes]
    .sort((a, b) => porTexto(a.id, b.id))
    .map((p) => ({
      ...p,
      vigencias: [...p.vigencias]
        .sort((a, b) => porTexto(`${a.desde}|${a.hasta}`, `${b.desde}|${b.hasta}`))
        .map((v) => ({
          ...v,
          tarifas: [...v.tarifas].sort((a, b) =>
            porTexto(normalizarNombre(a.nombre), normalizarNombre(b.nombre)),
          ),
        })),
    }));
}

export function huellaDeEstado(informe: InformeDeCatalogo, actual: CatalogoActual): string {
  const plan = JSON.stringify({
    resumen: informe.resumen,
    elementos: informe.elementos.map((e) => [e.nivel, e.codigo, e.ruta, e.mensaje]),
    noIncluidos: informe.noIncluidos.map((n) => [n.codigo, n.nombre]),
  });
  return createHash('sha256')
    .update(`${informe.huella}|${plan}|${JSON.stringify(instantanea(actual))}`)
    .digest('hex');
}

/** Con nada que crear ni actualizar, aplicar no escribe: reintentar es seguro aunque el estado cambiara. */
export function estaConvergido(informe: InformeDeCatalogo): boolean {
  return informe.resumen.creados === 0 && informe.resumen.actualizados === 0;
}
