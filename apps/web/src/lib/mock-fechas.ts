import { diaEnZona } from './viaje-solicitado-logica';

/**
 * Fechas de salida de la demostración que no caducan: «15 de diciembre» siempre es la próxima
 * 15 de diciembre (al menos `minimoDias` por delante), no un año fijo que un día queda en el
 * pasado y pinta de rojo todo el tablero. Así el chat que dice «diciembre» sigue coincidiendo con
 * la oportunidad, la cotización y el archivo de viaje.
 */
export function proximaOcurrencia(
  mes: number,
  dia: number,
  ahora: number = Date.now(),
  minimoDias: number = 7,
): string {
  const hoy = diaEnZona(ahora);
  const anio = Number(hoy.slice(0, 4));
  const limite = Date.parse(`${hoy}T00:00:00.000Z`) + minimoDias * 86_400_000;
  const en = (y: number) => Date.UTC(y, mes - 1, dia);
  const y = en(anio) >= limite ? anio : anio + 1;
  return new Date(en(y)).toISOString().slice(0, 10);
}
