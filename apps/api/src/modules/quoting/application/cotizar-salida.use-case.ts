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
import {
  type Composicion,
  esSuplemento,
  exigeComposicion,
  motivoNoAplica,
  vecesQueSeCobra,
} from '../domain/seleccion-de-tarifas.js';

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
    const composicion: Composicion = { adultos, ninos, infantes };
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
          masBarata: false,
        };
      };

      // --- La cotización armada: una línea por tarifa que cubra a alguien ---------
      //
      // Una cotización real NO es una tarifa: es una suma. Dos adultos a precio de adulto más un
      // niño a precio de menor. Antes solo se devolvían tarifas sueltas, y el número que el
      // asesor tiene que escribir en WhatsApp no estaba en ninguna respuesta.
      const lineas: OpcionDePrecio[] = [];
      const alternativas: OpcionDePrecio[] = [];
      const suplementos: OpcionDePrecio[] = [];
      const noAplicables: { tarifaId: string; nombre: string; motivo: string }[] = [];

      for (const t of filas) {
        const veces = vecesQueSeCobra(t, composicion);

        if (veces === null) {
          const motivo = motivoNoAplica(t, composicion);
          // Se devuelve CON su motivo en vez de desaparecer. Una promo que se esconde acaba
          // aplicándose con la calculadora del celular, y el informe de margen deja de cuadrar.
          if (motivo !== null) noAplicables.push({ tarifaId: t.id, nombre: t.nombre, motivo });
          continue;
        }

        if (esSuplemento(t)) {
          suplementos.push(aOpcion(t, 1));
        } else if (t.unidad === 'POR_GRUPO') {
          // Las de grupo REEMPLAZAN al armado: llevan condiciones que no conocemos —cupo del
          // mayorista, «no acumulable»—, y prometer un precio que no se puede honrar cuesta un
          // cliente. Se enseñan; no se aplican solas.
          alternativas.push(aOpcion(t, veces));
        } else {
          lineas.push(aOpcion(t, veces));
        }
      }

      const moneda = monedaDeLaBase(filas[0]?.monedaIso ?? 'COP');
      let total = Money.cero(moneda);
      for (const l of lineas)
        total = total.sumar(Money.desdeUnidades(BigInt(l.total.unidades), moneda));

      // Por TOTAL, no por precio unitario: en un celular se lee la primera línea, y ordenar por
      // unitario ponía la opción cara arriba —$189.000 por persona delante de $280.000 la pareja,
      // cuando para dos personas la pareja sale más barata—.
      alternativas.sort((a, b) => Number(BigInt(a.total.unidades) - BigInt(b.total.unidades)));
      if (alternativas[0]) alternativas[0].masBarata = true;

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
        lineas,
        total: { unidades: total.aPersistencia().unidades.toString(), moneda },
        alternativas,
        noAplicables,
        suplementos,
        pideComposicion: filas.some(exigeComposicion),
      };
    });
  }
}
