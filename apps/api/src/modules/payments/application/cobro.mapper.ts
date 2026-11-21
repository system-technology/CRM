/**
 * Del dominio al contrato (`@viajapro/contracts`). El dinero sale como texto entero con su moneda
 * (R8). Nada de neto ni margen: el puerto de `booking` no los trae.
 */
import {
  type AvisoDeCobro,
  type CobroDelArchivo,
  type FilaDeCobro,
  MedioDePago,
  type MovimientoDeCobro,
} from '@viajapro/contracts';
import {
  calcularCobro,
  type CobroCalculado,
  type CodigoMoneda,
  idsReversados,
  Money,
  sumasVigentes,
  type SumasDeCobro,
} from '@viajapro/domain';
import type { ArchivoParaCobro } from '../../../shared/puertos/puertos-hacia-booking.js';
import { diaEnZona } from '../domain/fechas.js';
import { monedaDeLaBase } from '../domain/moneda.js';
import type { Movimiento } from '../domain/movimiento.js';
import type { LecturaDeCobro } from './puertos-de-cobro.js';

export const DIAS_POR_DEFECTO = 30;

export const aDinero = (m: Money): { unidades: string; moneda: CodigoMoneda } => ({
  unidades: m.unidades.toString(),
  moneda: m.moneda,
});

export function aMovimiento(m: Movimiento, reversados: ReadonlySet<string>): MovimientoDeCobro {
  return {
    id: m.id,
    tipo: m.tipo,
    monto: aDinero(Money.desdeUnidades(m.montoUnidades, monedaDeLaBase(m.monedaIso))),
    pagadoEl: m.pagadoEl,
    medio: m.medio === null ? null : MedioDePago.parse(m.medio),
    pagadorId: m.pagadorId,
    referencia: m.referencia,
    nota: m.nota,
    notaTachadaEn: m.notaTachadaEn?.toISOString() ?? null,
    motivo: m.motivo,
    reversoDeId: m.reversoDeId,
    reversado: reversados.has(m.id),
    registradoPor: m.registradoPor,
    registradoEn: m.registradoEn.toISOString(),
  };
}

/** El cálculo común del detalle y de la vista: mismo dominio, mismas reglas. */
export function calcularParaArchivo(
  archivo: ArchivoParaCobro,
  sumas: SumasDeCobro,
  ctx: { zonaHoraria: string; diasDePlazo: number | null; plazoManual: string | null; ahora: Date },
): CobroCalculado {
  return calcularCobro({
    estadoDelArchivo: archivo.estado,
    ventaUnidades: archivo.ventaUnidades,
    moneda: monedaDeLaBase(archivo.monedaIso),
    sumas,
    fechaSalida: archivo.fechaSalida,
    creadoEl: diaEnZona(archivo.creadoEn, ctx.zonaHoraria),
    diasDePlazo: ctx.diasDePlazo ?? DIAS_POR_DEFECTO,
    plazoManual: ctx.plazoManual,
    hoy: diaEnZona(ctx.ahora, ctx.zonaHoraria),
  });
}

export function aCobroDelArchivo(lectura: LecturaDeCobro, ahora: Date): CobroDelArchivo {
  const { archivo, movimientos } = lectura;
  const calculado = calcularParaArchivo(
    archivo,
    sumasVigentes(
      movimientos.map((m) => ({
        id: m.id,
        tipo: m.tipo,
        montoUnidades: m.montoUnidades,
        reversoDeId: m.reversoDeId,
      })),
    ),
    {
      zonaHoraria: lectura.zonaHoraria,
      diasDePlazo: lectura.diasDePlazo,
      plazoManual: lectura.plazoManual,
      ahora,
    },
  );
  const reversados = idsReversados(movimientos);
  // Aviso (no impide): la fecha límite cae después del pago total al mayorista más próximo.
  const avisos: AvisoDeCobro[] = [];
  if (
    archivo.estado === 'ABIERTO' &&
    archivo.pagoTotalVenceEn !== null &&
    calculado.fechaLimite > diaEnZona(archivo.pagoTotalVenceEn, lectura.zonaHoraria)
  ) {
    avisos.push('FECHA_LIMITE_POSTERIOR_AL_PAGO_TOTAL_DEL_MAYORISTA');
  }
  return {
    archivoId: archivo.id,
    moneda: monedaDeLaBase(archivo.monedaIso),
    estadoDelArchivo: archivo.estado,
    total: aDinero(calculado.total),
    pagado: aDinero(calculado.pagado),
    saldo: aDinero(calculado.saldo),
    situacion: calculado.situacion,
    estadoDeCobro: calculado.estadoDeCobro,
    fechaLimite: calculado.fechaLimite,
    fechaLimiteManual: lectura.plazoManual !== null,
    diasDePlazo: lectura.diasDePlazo ?? DIAS_POR_DEFECTO,
    movimientos: movimientos.map((m) => aMovimiento(m, reversados)),
    avisos,
  };
}

export function aFilaDeCobro(archivo: ArchivoParaCobro, c: CobroCalculado): FilaDeCobro {
  return {
    archivoId: archivo.id,
    numero: archivo.numero,
    contactoId: archivo.contactoId,
    destino: archivo.destino,
    fechaSalida: archivo.fechaSalida,
    total: aDinero(c.total),
    pagado: aDinero(c.pagado),
    saldo: aDinero(c.saldo),
    situacion: c.situacion,
    estadoDeCobro: c.estadoDeCobro,
    fechaLimite: c.fechaLimite,
  };
}
