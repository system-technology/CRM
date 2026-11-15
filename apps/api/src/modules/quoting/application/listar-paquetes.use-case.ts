/**
 * Consultas del catálogo.
 *
 * Paginación por cursor desde el primer día: con desplazamiento, insertar una fila mientras
 * alguien pagina le hace ver un elemento dos veces o saltárselo. Cambiarlo después obliga a
 * tocar la API y el cliente a la vez.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { ParametrosPagina } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { PaqueteNoEncontradoError } from '../domain/errors.js';

const dinero = (unidades: bigint, moneda: string) => ({
  unidades: unidades.toString(),
  moneda,
});

/** `time` sin zona: se devuelve como HH:MM, la hora local del punto de encuentro (R9). */
const aHHMM = (hora: Date | null): string | null =>
  hora === null ? null : hora.toISOString().slice(11, 16);

export function vistaDeOpcion(o: {
  id: string;
  etiqueta: string;
  horaSalida: Date | null;
  horaRegreso: Date | null;
  puntoDeEncuentro: string | null;
  orden: number;
  activa: boolean;
}) {
  return {
    id: o.id,
    etiqueta: o.etiqueta,
    horaSalida: aHHMM(o.horaSalida),
    horaRegreso: aHHMM(o.horaRegreso),
    puntoDeEncuentro: o.puntoDeEncuentro,
    orden: o.orden,
    activa: o.activa,
  };
}

@Injectable()
export class ListarPaquetesUseCase {
  // `@Inject` explicito, y no es ceremonia: el transpilador de desarrollo (`tsx`) NO emite los
  // metadatos de decorador que Nest necesita para resolver el tipo. Sin esto, Nest construye la
  // clase CON CERO DEPENDENCIAS y sin quejarse, y el fallo sale como `undefined` en la primera
  // peticion real. Compila, arranca, y revienta al usarse. Ver cola 11c de `ESTADO.md`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ejecutar(params: ParametrosPagina) {
    return this.prisma.conTenant(async (tx) => {
      // Se pide uno de más para saber si hay página siguiente sin hacer un COUNT,
      // que en una tabla grande es caro y además miente en cuanto alguien inserta.
      const filas = await tx.paquete.findMany({
        where: { eliminadoEn: null, activo: true },
        orderBy: { id: 'asc' },
        take: params.limite + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          nombre: true,
          destino: true,
          paisIso: true,
          dias: true,
          noches: true,
          planAlimentacion: true,
          inclusiones: true,
          exclusiones: true,
          descripcion: true,
          activo: true,
          mayoristaId: true,
          creadoEn: true,
          codigo: true,
          cargosEnDestino: true,
          camposPersonalizados: true,
          formato: { select: { id: true, nombre: true } },
          opcionesDeSalida: { orderBy: { orden: 'asc' } },
        },
      });

      const hayMas = filas.length > params.limite;
      const datos = hayMas ? filas.slice(0, params.limite) : filas;

      return {
        datos: datos.map((p) => ({
          ...p,
          creadoEn: p.creadoEn.toISOString(),
          opcionesDeSalida: p.opcionesDeSalida.map(vistaDeOpcion),
        })),
        pageInfo: {
          nextCursor: hayMas ? (datos[datos.length - 1]?.id ?? null) : null,
          hasMore: hayMas,
        },
      };
    });
  }

  /** El neto de cada tarifa solo viaja con `incluirMargen`: R10. */
  async detalle(id: string, incluirMargen = false) {
    return this.prisma.conTenant(async (tx) => {
      const paquete = await tx.paquete.findFirst({
        where: { id, eliminadoEn: null },
        include: {
          // Lo que lee el cotizador (`activa: true`, como en `CotizarSalidaUseCase`): ADR-0025.
          vigencias: {
            where: { activa: true },
            orderBy: [{ desde: 'asc' }, { hasta: 'asc' }],
            include: {
              tarifas: {
                orderBy: [{ aditiva: 'asc' }, { ventaUnidades: 'asc' }, { id: 'asc' }],
              },
            },
          },
          mayorista: { select: { id: true, nombre: true, diasTimeLimit: true } },
          formato: { select: { id: true, nombre: true } },
          opcionesDeSalida: { orderBy: { orden: 'asc' } },
        },
      });

      // RLS ya garantiza que no veamos paquetes de otra agencia: si no aparece, o no
      // existe o es de otro tenant. Desde fuera son indistinguibles, y así debe ser —
      // responder "existe pero no es tuyo" filtraría información.
      if (!paquete) throw new PaqueteNoEncontradoError(id);

      return {
        ...paquete,
        creadoEn: paquete.creadoEn.toISOString(),
        actualizadoEn: paquete.actualizadoEn.toISOString(),
        opcionesDeSalida: paquete.opcionesDeSalida.map(vistaDeOpcion),
        vigencias: paquete.vigencias.map((v) => ({
          id: v.id,
          desde: v.desde.toISOString().slice(0, 10),
          hasta: v.hasta.toISOString().slice(0, 10),
          publicada: v.publicada,
          cupoTotal: v.cupoTotal,
          tarifas: v.tarifas.map((t) => ({
            id: t.id,
            nombre: t.nombre,
            unidad: t.unidad,
            cubrePasajeros: t.cubrePasajeros,
            aditiva: t.aditiva,
            // `mayoristaId` tampoco sale: es dato de compra, no de venta.
            ...(incluirMargen
              ? { neto: t.netoUnidades === null ? null : dinero(t.netoUnidades, t.monedaIso) }
              : {}),
            venta: dinero(t.ventaUnidades, t.monedaIso),
            condicion: {
              acomodacion: t.acomodacion,
              tipoPasajero: t.tipoPasajero,
              edadMinima: t.edadMinima,
              edadMaxima: t.edadMaxima,
              pasajerosMinimo: t.pasajerosMinimo,
              pasajerosMaximo: t.pasajerosMaximo,
              ocupaSilla: t.ocupaSilla,
            },
          })),
        })),
      };
    });
  }
}
