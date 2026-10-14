/**
 * Cotizar contra una fecha: resolver la ventana y decir todas las formas de cobrarla.
 *
 * **Aquí es donde ADR-0009 deja de ser un documento.** Este caso de uso no sabe si la agencia
 * publica salidas con fecha o trabaja con vigencias abiertas: pide las ventanas del paquete y
 * deja que `resolverVigencia` elija. Esa indiferencia es la decisión.
 *
 * **Devuelve TODAS las opciones aplicables, no una.** Si dos personas van a un pasadía que tiene
 * promo de pareja, el asesor ve las dos y elige. Elegir por él en silencio le escondería una
 * decisión comercial que es suya, y la barata no siempre es la que quiere.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { CotizacionDeSalida, CotizarSalida, OpcionDePrecio } from '@viajapro/contracts';
import {
  Money,
  POLITICA_POR_DEFECTO,
  calcularMargen,
  esSalidaProgramada,
  resolverVigencia,
  type BaseDelMargen,
} from '@viajapro/domain';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PaqueteNoEncontradoError } from '../domain/errors.js';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';
import { esSuplemento, exigeComposicion, vecesQueSeCobra } from '../domain/seleccion-de-tarifas.js';

/** Una tarifa tal como sale de la base, antes de convertirse en opción de precio. */
interface FilaTarifa {
  id: string;
  nombre: string;
  unidad: 'POR_PERSONA' | 'POR_GRUPO';
  cubrePasajeros: number;
  netoUnidades: bigint | null;
  ventaUnidades: bigint;
  monedaIso: string;
  aditiva: boolean;
  acomodacion: string | null;
  tipoPasajero: string | null;
  edadMinima: number | null;
  edadMaxima: number | null;
  pasajerosMinimo: number | null;
  pasajerosMaximo: number | null;
  ocupaSilla: boolean | null;
}

const aFecha = (d: Date): string => d.toISOString().slice(0, 10);

@Injectable()
export class CotizarSalidaUseCase {
  // `@Inject` explicito, y no es ceremonia: el transpilador de desarrollo (`tsx`) NO emite los
  // metadatos de decorador que Nest necesita para resolver el tipo. Sin esto, Nest construye la
  // clase CON CERO DEPENDENCIAS y sin quejarse, y el fallo sale como `undefined` en la primera
  // peticion real. Compila, arranca, y revienta al usarse. Ver cola 11c de `ESTADO.md`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ejecutar(peticion: CotizarSalida): Promise<CotizacionDeSalida> {
    const adultos = peticion.adultos ?? 1;
    const ninos = peticion.ninos ?? 0;
    const infantes = peticion.infantes ?? 0;
    const pasajeros = adultos + ninos + infantes;

    return this.prisma.conTenant(async (tx) => {
      const paquete = await tx.paquete.findFirst({
        where: { id: peticion.paqueteId, eliminadoEn: null },
        select: { id: true, nombre: true, destino: true, noches: true },
      });
      if (!paquete) throw new PaqueteNoEncontradoError(peticion.paqueteId);

      const ventanas = await tx.vigencia.findMany({
        where: { paqueteId: paquete.id, activa: true },
        select: { id: true, desde: true, hasta: true, publicada: true },
      });

      // Aquí no se decide nada: la regla de desempate vive en el dominio, probada aparte, y es
      // la misma para toda agencia. Si dos ventanas empatan, sale como error de datos.
      const elegida = resolverVigencia(
        ventanas.map((v) => ({ ...v, desde: aFecha(v.desde), hasta: aFecha(v.hasta) })),
        peticion.fecha,
      );

      // Sin `where`: RLS ya acota a esta agencia, y hay una sola fila por tenant. Pasarle el
      // `tenantId` a mano aqui seria repetir en la consulta lo que la politica ya garantiza, y
      // abrir la puerta a que alguien lo tome del cuerpo de la peticion.
      const politica = await tx.politicaDePrecio.findFirst({ select: { base: true } });
      const base: BaseDelMargen = (politica?.base as BaseDelMargen) ?? POLITICA_POR_DEFECTO.base;

      const filas = (await tx.tarifa.findMany({
        where: { vigenciaId: elegida.id },
        orderBy: { ventaUnidades: 'asc' },
      })) as unknown as FilaTarifa[];

      const aOpcion = (t: FilaTarifa, veces: number): OpcionDePrecio => {
        const moneda = monedaDeLaBase(t.monedaIso);
        const unitario = Money.desdeUnidades(t.ventaUnidades, moneda);
        const total = unitario.porCantidad(veces);
        const neto = t.netoUnidades === null ? null : Money.desdeUnidades(t.netoUnidades, moneda);
        const margenLinea = calcularMargen(neto, unitario, base);

        return {
          tarifaId: t.id,
          nombre: t.nombre,
          unidad: t.unidad,
          cubrePasajeros: t.cubrePasajeros,
          veces,
          precioUnitario: { unidades: t.ventaUnidades.toString(), moneda },
          total: { unidades: total.aPersistencia().unidades.toString(), moneda },
          margen:
            margenLinea === null
              ? null
              : {
                  unidades: margenLinea.importe
                    .porCantidad(veces)
                    .aPersistencia()
                    .unidades.toString(),
                  moneda,
                },
          margenPorcentaje: margenLinea?.porcentaje ?? null,
          recomendada: false,
        };
      };

      const opciones: OpcionDePrecio[] = [];
      const suplementos: OpcionDePrecio[] = [];

      for (const t of filas) {
        const veces = vecesQueSeCobra(t, pasajeros);
        if (veces === null) continue;
        // Un suplemento se ofrece, no se suma solo: el de sencilla depende de cómo duerman.
        // Un suplemento se cobra una vez y se ofrece aparte: no se suma solo.
        (esSuplemento(t) ? suplementos : opciones).push(aOpcion(t, esSuplemento(t) ? 1 : veces));
      }

      // La recomendada es la más barata, y se marca a la vista en lugar de aplicarse a escondidas.
      let masBarata: OpcionDePrecio | null = null;
      for (const o of opciones) {
        if (masBarata === null || BigInt(o.total.unidades) < BigInt(masBarata.total.unidades)) {
          masBarata = o;
        }
      }
      if (masBarata) masBarata.recomendada = true;

      return {
        paqueteId: paquete.id,
        paqueteNombre: paquete.nombre,
        destino: paquete.destino,
        noches: paquete.noches,
        fecha: peticion.fecha,
        vigenciaId: elegida.id,
        vigenciaDesde: elegida.desde,
        vigenciaHasta: elegida.hasta,
        deSalidaProgramada: esSalidaProgramada(elegida),
        adultos,
        ninos,
        infantes,
        pasajeros,
        opciones,
        suplementos,
        pideComposicion: filas.some(exigeComposicion),
      };
    });
  }
}
