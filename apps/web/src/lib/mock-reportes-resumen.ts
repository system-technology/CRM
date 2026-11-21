/**
 * Resumen de reportes de demostración, en la forma del contrato (`ResumenDeReportes`, R3). Solo se
 * lee con `estaUsandoApiReal() === false`. Sin neto ni margen: la demo se comporta como un rol sin
 * `cotizacion.ver_neto_y_margen`. R8: COP en pesos enteros.
 */
import { ResumenDeReportes } from '@viajapro/contracts';
import { obtenerMockCotizaciones } from './mock-cotizaciones';
import type { RangoDeInstantes } from './reportes-periodo';

const DIA_MS = 86_400_000;

const ASESOR_DEMO = '01932000-0000-7000-8000-0000000a0001';

/**
 * Cotizaciones abiertas de la demo (T-556): las cuenta de las MISMAS cotizaciones que lista la
 * pantalla de Cotizaciones, para que Hoy y el listado cuenten lo mismo. Los tramos son por días
 * completos desde `enviadaEn` (≤3, 4–7, >7), como los cuenta el servidor.
 */
function cotizacionesAbiertasDemo(propio: boolean, ahora: number) {
  const abiertas = obtenerMockCotizaciones().filter(
    (c) => c.estado === 'BORRADOR' || c.estado === 'ENVIADA',
  );
  // Un asesor ve solo una parte (la misma fracción que el resto de la maqueta).
  const suyas = propio ? abiertas.slice(0, Math.ceil(abiertas.length * 0.4)) : abiertas;
  const tramos = { hastaTresDias: 0, deCuatroASiete: 0, masDeSiete: 0 };
  for (const c of suyas) {
    if (c.estado !== 'ENVIADA' || !c.enviadaEn) continue;
    const dias = Math.floor((ahora - Date.parse(c.enviadaEn)) / DIA_MS);
    if (dias <= 3) tramos.hastaTresDias += 1;
    else if (dias <= 7) tramos.deCuatroASiete += 1;
    else tramos.masDeSiete += 1;
  }
  return {
    total: suyas.length,
    borradores: suyas.filter((c) => c.estado === 'BORRADOR').length,
    enviadas: suyas.filter((c) => c.estado === 'ENVIADA').length,
    porAntiguedad: tramos,
  };
}

/**
 * Por cobrar de la demo (T-556), una fila por moneda y SIN sumar entre ellas (R8). COP en pesos
 * (su unidad mínima es el peso) y USD en centavos. La agencia suma los saldos de los archivos
 * abiertos de la demo —los mismos de «Por cobrar» en el dashboard de administración: lo prueba
 * `mock-demo-coherencia.spec.ts`—. Lo de un asesor es una parte.
 *
 * El caso `truncado: true` está en la vista de UN asesor (`?alcanceDemo=propio`, «Mis números»),
 * a propósito: la demo enseña también ese estado («o más») sin contradecir los cobros de la agencia,
 * que sí caben completos.
 */
function porCobrarDemo(propio: boolean) {
  return propio
    ? {
        truncado: true,
        porMoneda: [
          { moneda: 'COP', archivos: 2, saldo: { unidades: '7020000', moneda: 'COP' } },
          { moneda: 'USD', archivos: 1, saldo: { unidades: '412000', moneda: 'USD' } },
        ],
      }
    : {
        truncado: false,
        porMoneda: [
          { moneda: 'COP', archivos: 5, saldo: { unidades: '25110000', moneda: 'COP' } },
          { moneda: 'USD', archivos: 2, saldo: { unidades: '792000', moneda: 'USD' } },
        ],
      };
}

export function crearResumenDeReportesDemo(
  rango: RangoDeInstantes & { asesorId?: string | undefined },
  alcance: 'PROPIO' | 'AGENCIA' = 'AGENCIA',
): ResumenDeReportes {
  const dias = Math.max(
    1,
    Math.round((Date.parse(rango.hasta) - Date.parse(rango.desde)) / DIA_MS),
  );
  // Escala con la longitud del periodo para que cambiar de periodo se note, sin salir de lo verosímil.
  const k = Math.max(1, Math.round(dias / 30));
  // Un asesor ve «lo suyo»: una fracción de lo que suma la agencia, sin ranking ni totales ajenos.
  const propio = alcance === 'PROPIO' || rango.asesorId === 'yo';
  const f = propio ? 0.4 : 1;
  const e = (n: number) => Math.max(1, Math.round(n * f));
  const enviadas = e(14 * k);
  const aceptadas = e(5 * k);
  const ganadas = e(5 * k);
  const perdidas = e(3 * k);
  const creadas = e(22 * k);
  const nuevas = e(61 * k);
  const respondidas = e(57 * k);

  const etapas = [
    {
      nombre: 'Oportunidad nueva',
      orden: 1,
      esGanada: false,
      esPerdida: false,
      cantidad: e(6 * k),
    },
    { nombre: 'En cotización', orden: 2, esGanada: false, esPerdida: false, cantidad: e(5 * k) },
    { nombre: 'En negociación', orden: 3, esGanada: false, esPerdida: false, cantidad: e(3 * k) },
    { nombre: 'Ganada', orden: 4, esGanada: true, esPerdida: false, cantidad: ganadas },
    { nombre: 'Perdida', orden: 5, esGanada: false, esPerdida: true, cantidad: perdidas },
  ];

  return ResumenDeReportes.parse({
    ...(alcance === 'PROPIO'
      ? { alcance: 'PROPIO', asesorId: ASESOR_DEMO }
      : { alcance: 'AGENCIA', asesorId: rango.asesorId === 'yo' ? ASESOR_DEMO : null }),
    periodo: { desde: rango.desde, hasta: rango.hasta },
    cotizaciones: {
      creadas: e(19 * k),
      enviadas,
      aceptadas,
      tasaAceptacion: Math.round((aceptadas / enviadas) * 1000) / 10,
    },
    // Cifras de HOY, no del periodo (T-528); `porCobrar` solo existe con `cobro.ver`, y la demo se
    // comporta como un rol que lo tiene.
    cotizacionesAbiertas: cotizacionesAbiertasDemo(propio, Date.now()),
    porCobrar: porCobrarDemo(propio),
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
