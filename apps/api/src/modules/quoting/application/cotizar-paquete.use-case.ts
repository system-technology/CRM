/**
 * Cotizar un paquete: de "somos 4 para San Andrés en diciembre" a un precio.
 *
 * Es el caso de uso central de la cabeza de playa y donde se concentran las trampas del
 * dominio. Ver `docs/01-producto/07-cabeza-de-playa-paquetes.md`.
 */

import { Injectable } from '@nestjs/common';
import {
  type Acomodacion,
  type CotizacionCalculada,
  type CotizarPaquete,
  type LineaCotizacion,
} from '@viajapro/contracts';
import {
  ComposicionPasajeros,
  Money,
  acomodacionesExactas,
  distribuirEnHabitaciones,
  personasPorHabitacion,
  type CodigoMoneda,
  type TipoPasajero,
} from '@viajapro/domain';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import {
  AcomodacionSinPrecioError,
  PaqueteNoEncontradoError,
  SinTemporadaParaLaFechaError,
} from '../domain/errors.js';

@Injectable()
export class CotizarPaqueteUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async ejecutar(entrada: CotizarPaquete): Promise<CotizacionCalculada> {
    const composicion = ComposicionPasajeros.crear({
      adultos: entrada.pasajeros.adultos,
      ninos: entrada.pasajeros.ninos,
      infantes: entrada.pasajeros.infantes,
    });

    return this.prisma.conTenant(async (tx) => {
      const paquete = await tx.paquete.findFirst({
        where: { id: entrada.paqueteId, eliminadoEn: null },
      });
      if (!paquete) throw new PaqueteNoEncontradoError(entrada.paqueteId);

      const fecha = new Date(entrada.fechaSalida);

      // La temporada se elige por la fecha de SALIDA, no por la de reserva: un viaje
      // comprado en octubre para diciembre se cobra a precio de diciembre.
      const temporada = await tx.temporada.findFirst({
        where: { paqueteId: paquete.id, desde: { lte: fecha }, hasta: { gte: fecha } },
        include: { precios: true },
        // Si dos temporadas se solapan —ocurre con los puentes dentro de temporada alta—
        // gana la más corta, que es la más específica. Es como razona un tarifario.
        orderBy: [{ desde: 'desc' }],
      });
      if (!temporada) throw new SinTemporadaParaLaFechaError(paquete.nombre, entrada.fechaSalida);

      const acomodacion = entrada.acomodacion ?? this.sugerirAcomodacion(composicion, temporada.precios);
      const reparto = distribuirEnHabitaciones(composicion, acomodacion);

      const moneda = (temporada.precios[0]?.monedaIso ?? 'COP') as CodigoMoneda;
      const lineas: LineaCotizacion[] = [];
      let totalVenta = Money.cero(moneda);
      let totalNeto = Money.cero(moneda);

      const porTipo: Array<[TipoPasajero, number]> = [
        ['ADT', composicion.adultos],
        ['CHD', composicion.ninos],
        ['INF', composicion.infantes],
      ];

      for (const [tipo, cantidad] of porTipo) {
        if (cantidad === 0) continue;

        // Los infantes no ocupan plaza, así que su precio no depende de la acomodación
        // elegida: se busca el que haya, sea cual sea.
        const precio =
          tipo === 'INF'
            ? temporada.precios.find((p) => p.tipoPasajero === 'INF')
            : temporada.precios.find(
                (p) => p.tipoPasajero === tipo && p.acomodacion === acomodacion,
              );

        if (!precio) throw new AcomodacionSinPrecioError(acomodacion, tipo, temporada.nombre);

        let venta = Money.desdeUnidades(precio.ventaUnidades, precio.monedaIso);
        if (entrada.markupExtra != null && entrada.markupExtra !== 0) {
          venta = venta.aplicarMarkup(entrada.markupExtra);
        }
        const neto = Money.desdeUnidades(precio.netoUnidades, precio.monedaIso);

        const subtotalVenta = venta.porCantidad(cantidad);
        const subtotalNeto = neto.porCantidad(cantidad);

        totalVenta = totalVenta.sumar(subtotalVenta);
        totalNeto = totalNeto.sumar(subtotalNeto);

        lineas.push({
          tipoPasajero: tipo,
          cantidad,
          precioUnitarioVenta: { unidades: venta.unidades.toString(), moneda: venta.moneda },
          subtotalVenta: {
            unidades: subtotalVenta.unidades.toString(),
            moneda: subtotalVenta.moneda,
          },
          subtotalNeto: {
            unidades: subtotalNeto.unidades.toString(),
            moneda: subtotalNeto.moneda,
          },
        });
      }

      const margen = totalVenta.restar(totalNeto);
      const margenPorcentaje =
        totalVenta.unidades === 0n
          ? 0
          : Number((margen.unidades * 10_000n) / totalVenta.unidades) / 100;

      const regreso = new Date(fecha);
      regreso.setUTCDate(regreso.getUTCDate() + paquete.dias - 1);

      return {
        paqueteId: paquete.id,
        paqueteNombre: paquete.nombre,
        destino: paquete.destino,
        fechaSalida: entrada.fechaSalida,
        fechaRegreso: regreso.toISOString().slice(0, 10),
        temporadaNombre: temporada.nombre,
        acomodacion,
        habitaciones: reparto.habitaciones.map((h) => ({ ...h })),
        plazasSinUsar: reparto.plazasSinUsar,
        lineas,
        totalVenta: { unidades: totalVenta.unidades.toString(), moneda: totalVenta.moneda },
        totalNeto: { unidades: totalNeto.unidades.toString(), moneda: totalNeto.moneda },
        margen: { unidades: margen.unidades.toString(), moneda: margen.moneda },
        margenPorcentaje,
      };
    });
  }

  /**
   * Elige acomodación cuando el asesor no la indica.
   *
   * Criterio: entre las que no dejan camas vacías y **tienen precio para TODOS los tipos de
   * pasajero que ocupan plaza**, la que más gente mete por habitación — que es la más barata
   * por persona. Es lo que haría un asesor, y si se equivoca, cambiarla es un clic.
   *
   * Lo de "todos los tipos" no es un detalle: un tarifario real publica adultos en cuádruple
   * pero a menudo no publica niños en cuádruple. Mirar solo el precio de adulto hacía que se
   * sugiriera una acomodación que luego no se podía cotizar — un callejón sin salida para una
   * familia, que es justo el cliente más común.
   *
   * Los infantes no entran en el criterio: no ocupan plaza y su precio no depende de la
   * acomodación.
   */
  private sugerirAcomodacion(
    composicion: ComposicionPasajeros,
    precios: Array<{ acomodacion: string; tipoPasajero: string }>,
  ): Acomodacion {
    const tiposQueOcupanPlaza: TipoPasajero[] = [
      ...(composicion.adultos > 0 ? (['ADT'] as const) : []),
      ...(composicion.ninos > 0 ? (['CHD'] as const) : []),
    ];

    /** ¿Esta acomodación tiene precio para cada tipo de pasajero que va? */
    const cotizable = (acomodacion: string) =>
      tiposQueOcupanPlaza.every((tipo) =>
        precios.some((p) => p.acomodacion === acomodacion && p.tipoPasajero === tipo),
      );

    const ordenarPorCapacidad = (lista: Acomodacion[]) =>
      [...lista].sort((a, b) => personasPorHabitacion(b) - personasPorHabitacion(a));

    // Primera opción: sin camas vacías y cotizable entera.
    const exactas = acomodacionesExactas(composicion).filter(cotizable);
    if (exactas.length > 0) return ordenarPorCapacidad(exactas)[0]!;

    // Segunda: cotizable aunque sobren plazas. El reparto avisará de las que se pagan vacías.
    const cualquieraCotizable = (
      [...new Set(precios.map((p) => p.acomodacion))] as Acomodacion[]
    ).filter(cotizable);
    if (cualquieraCotizable.length > 0) return ordenarPorCapacidad(cualquieraCotizable)[0]!;

    // Si nada es cotizable, se devuelve la de mayor capacidad publicada para que el error
    // que lance el cálculo diga exactamente qué combinación falta en el tarifario.
    const publicadas = ordenarPorCapacidad([
      ...new Set(precios.map((p) => p.acomodacion)),
    ] as Acomodacion[]);
    return publicadas[0] ?? 'DOBLE';
  }
}
