/**
 * Resumen de reportes de demostración, en la forma del contrato (`ResumenDeReportes`, R3). Solo se
 * lee con `estaUsandoApiReal() === false`. Sin neto ni margen: la demo se comporta como un rol sin
 * `cotizacion.ver_neto_y_margen`. R8: COP en pesos enteros.
 */
import { ResumenDeReportes } from '@viajapro/contracts';
import type { RangoDeInstantes } from './reportes-periodo';

const DIA_MS = 86_400_000;

export function crearResumenDeReportesDemo(rango: RangoDeInstantes): ResumenDeReportes {
  const dias = Math.max(
    1,
    Math.round((Date.parse(rango.hasta) - Date.parse(rango.desde)) / DIA_MS),
  );
  // Escala con la longitud del periodo para que cambiar de periodo se note, sin salir de lo verosímil.
  const k = Math.max(1, Math.round(dias / 30));
  const enviadas = 14 * k;
  const aceptadas = 5 * k;
  const ganadas = 5 * k;
  const perdidas = 3 * k;
  const creadas = 22 * k;
  const nuevas = 61 * k;
  const respondidas = 57 * k;

  const etapas = [
    { nombre: 'Oportunidad nueva', orden: 1, esGanada: false, esPerdida: false, cantidad: 6 * k },
    { nombre: 'En cotización', orden: 2, esGanada: false, esPerdida: false, cantidad: 5 * k },
    { nombre: 'En negociación', orden: 3, esGanada: false, esPerdida: false, cantidad: 3 * k },
    { nombre: 'Ganada', orden: 4, esGanada: true, esPerdida: false, cantidad: ganadas },
    { nombre: 'Perdida', orden: 5, esGanada: false, esPerdida: true, cantidad: perdidas },
  ];

  return ResumenDeReportes.parse({
    periodo: { desde: rango.desde, hasta: rango.hasta },
    cotizaciones: {
      creadas: 19 * k,
      enviadas,
      aceptadas,
      tasaAceptacion: Math.round((aceptadas / enviadas) * 1000) / 10,
    },
    ventasPorMoneda: [
      {
        moneda: 'COP',
        cotizacionesAceptadas: aceptadas,
        ventas: { unidades: String(31_450_000 * k), moneda: 'COP' },
      },
    ],
    oportunidades: {
      creadas,
      ganadas,
      perdidas,
      abiertas: creadas - ganadas - perdidas,
      tasaConversion: Math.round((ganadas / (ganadas + perdidas)) * 1000) / 10,
      porEtapa: etapas.map((e, i) => ({
        etapaId: `01932000-0000-7000-8000-0000000d${(i + 1).toString().padStart(4, '0')}`,
        ...e,
      })),
    },
    respuesta: {
      conversacionesNuevas: nuevas,
      conversacionesRespondidas: respondidas,
      promedioMinutos: 11.4,
      medianaMinutos: 7.0,
      p90Minutos: 26.5,
      sinResponder: nuevas - respondidas,
      tasaRespuesta: Math.round((respondidas / nuevas) * 1000) / 10,
    },
  });
}
