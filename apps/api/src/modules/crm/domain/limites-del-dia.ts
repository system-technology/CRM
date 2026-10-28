/**
 * «Hoy» de una agencia como rango de instantes UTC (R9: la base guarda UTC, la zona horaria del
 * tenant solo interviene al presentar). Puro y sin librerías: `Intl` resuelve el huso, incluido
 * el cambio de horario de verano en las zonas que lo tienen.
 */

export interface LimitesDelDia {
  /** AAAA-MM-DD del día local. */
  fecha: string;
  /** Primer instante del día local (inclusive). */
  desde: Date;
  /** Primer instante del día local siguiente (exclusivo). */
  hasta: Date;
}

/** Milisegundos que la zona se adelanta (+) o atrasa (-) respecto de UTC en ese instante. */
function desplazamientoMs(zona: string, instante: Date): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instante);
  const v = (tipo: string): number => Number(partes.find((p) => p.type === tipo)?.value);
  const comoUtc = Date.UTC(
    v('year'),
    v('month') - 1,
    v('day'),
    v('hour'),
    v('minute'),
    v('second'),
  );
  return comoUtc - Math.floor(instante.getTime() / 1000) * 1000;
}

function medianocheLocal(zona: string, a: number, m: number, d: number): Date {
  const base = Date.UTC(a, m - 1, d);
  // Dos pasadas: el desplazamiento se mide en el instante resultante, que puede caer al otro
  // lado de un cambio de horario respecto del de la primera estimación.
  const primero = base - desplazamientoMs(zona, new Date(base));
  return new Date(base - desplazamientoMs(zona, new Date(primero)));
}

export function limitesDelDia(zonaHoraria: string, ahora: Date): LimitesDelDia {
  const fecha = new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(ahora);
  const [a, m, d] = fecha.split('-').map(Number);
  if (a === undefined || m === undefined || d === undefined) {
    // Inalcanzable con `en-CA`; se conserva el tipo estricto sin un `!`.
    return { fecha, desde: ahora, hasta: ahora };
  }
  const siguiente = new Date(Date.UTC(a, m - 1, d + 1));
  return {
    fecha,
    desde: medianocheLocal(zonaHoraria, a, m, d),
    hasta: medianocheLocal(
      zonaHoraria,
      siguiente.getUTCFullYear(),
      siguiente.getUTCMonth() + 1,
      siguiente.getUTCDate(),
    ),
  };
}
