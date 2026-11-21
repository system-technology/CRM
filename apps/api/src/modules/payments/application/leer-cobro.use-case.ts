/**
 * Leer el cobro (ADR-0034 §3, §8): el saldo de un archivo con su historial, y la vista «quién pagó y
 * quién debe». Todo se calcula aquí, en el servidor, en cada lectura: el cliente no envía saldo,
 * estado ni autor, y nada de esto es columna.
 *
 * **Sumas.** Las del detalle salen de los movimientos leídos (bigint en el dominio); las de la vista
 * las agrupa la base y llegan como `bigint` (nunca `Number`). Mismas reglas de «vigente» en ambos.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  CobroDelArchivo,
  ListarCobros,
  TotalDeCobroPorMoneda,
  VistaDeCobros,
} from '@viajapro/contracts';
import { type CodigoMoneda, Money, SUMAS_EN_CERO } from '@viajapro/domain';
import { ArchivoDeCobroNoEncontradoError } from '../domain/errors.js';
import { monedaDeLaBase } from '../domain/moneda.js';
import { aCobroDelArchivo, aDinero, aFilaDeCobro, calcularParaArchivo } from './cobro.mapper.js';
import { RepositorioDeCobros } from './puertos-de-cobro.js';

/** Cuántos archivos abiertos calcula la vista como máximo (HU-payments-1: 2.000). */
export const TOPE_DE_LA_VISTA = 2000;

@Injectable()
export class LeerCobroUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(@Inject(RepositorioDeCobros) private readonly cobros: RepositorioDeCobros) {}

  async delArchivo(archivoId: string): Promise<CobroDelArchivo> {
    const lectura = await this.cobros.leerCobro(archivoId);
    if (!lectura) throw new ArchivoDeCobroNoEncontradoError(archivoId);
    return aCobroDelArchivo(lectura, new Date());
  }

  async vista(filtro: ListarCobros): Promise<VistaDeCobros> {
    const ahora = new Date();
    const lectura = await this.cobros.leerVista(TOPE_DE_LA_VISTA);

    const filas = lectura.archivos
      .map((archivo) => {
        const calculado = calcularParaArchivo(
          archivo,
          lectura.sumas.get(archivo.id) ?? SUMAS_EN_CERO,
          {
            zonaHoraria: lectura.zonaHoraria,
            diasDePlazo: lectura.diasDePlazo,
            plazoManual: lectura.plazosManuales.get(archivo.id) ?? null,
            ahora,
          },
        );
        return { archivo, calculado };
      })
      .filter(
        ({ calculado }) =>
          filtro.estadoDeCobro === undefined || calculado.estadoDeCobro === filtro.estadoDeCobro,
      );

    // Totales por moneda, en bigint: nunca se suman monedas distintas.
    const porMoneda = new Map<
      CodigoMoneda,
      { archivos: number; total: bigint; pagado: bigint; porCobrar: bigint }
    >();
    for (const { archivo, calculado } of filas) {
      const moneda = monedaDeLaBase(archivo.monedaIso);
      const t = porMoneda.get(moneda) ?? { archivos: 0, total: 0n, pagado: 0n, porCobrar: 0n };
      t.archivos += 1;
      t.total += calculado.total.unidades;
      t.pagado += calculado.pagado.unidades;
      if (calculado.saldo.unidades > 0n) t.porCobrar += calculado.saldo.unidades;
      porMoneda.set(moneda, t);
    }
    const totales: TotalDeCobroPorMoneda[] = [...porMoneda.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([moneda, t]) => ({
        moneda,
        archivos: t.archivos,
        total: aDinero(Money.desdeUnidades(t.total, moneda)),
        pagado: aDinero(Money.desdeUnidades(t.pagado, moneda)),
        porCobrar: aDinero(Money.desdeUnidades(t.porCobrar, moneda)),
      }));

    // Lo más urgente primero: fecha límite ascendente, y a igual fecha, número de file.
    const ordenadas = [...filas].sort(
      (x, y) =>
        x.calculado.fechaLimite.localeCompare(y.calculado.fechaLimite) ||
        x.archivo.numero - y.archivo.numero,
    );
    return {
      datos: ordenadas
        .slice(0, filtro.limite)
        .map(({ archivo, calculado }) => aFilaDeCobro(archivo, calculado)),
      totales,
      truncado: lectura.truncado,
    };
  }
}
