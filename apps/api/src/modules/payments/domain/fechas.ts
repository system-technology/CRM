/**
 * «Hoy» y «el día de» en la zona horaria de la agencia (R9: la base guarda UTC; la zona solo se
 * usa para comparar fechas de calendario). `Intl` resuelve el huso sin librerías.
 */
export function diaEnZona(instante: Date, zonaHoraria: string): string {
  // `en-CA` formatea AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zonaHoraria,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instante);
}

/** Una columna `date` llega como `Date` a medianoche UTC: su día es el de la parte UTC. */
export const diaDeColumnaDate = (d: Date): string => d.toISOString().slice(0, 10);
