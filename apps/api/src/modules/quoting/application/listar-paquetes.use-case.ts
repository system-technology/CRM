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
        },
      });

      const hayMas = filas.length > params.limite;
      const datos = hayMas ? filas.slice(0, params.limite) : filas;

      return {
        datos: datos.map((p) => ({ ...p, creadoEn: p.creadoEn.toISOString() })),
        pageInfo: {
          nextCursor: hayMas ? (datos[datos.length - 1]?.id ?? null) : null,
          hasMore: hayMas,
        },
      };
    });
  }

  /** El neto de cada precio solo viaja con `incluirMargen`: R10. */
  async detalle(id: string, incluirMargen = false) {
    return this.prisma.conTenant(async (tx) => {
      const paquete = await tx.paquete.findFirst({
        where: { id, eliminadoEn: null },
        include: {
          temporadas: {
            orderBy: { desde: 'asc' },
            include: { precios: { orderBy: [{ acomodacion: 'asc' }, { tipoPasajero: 'asc' }] } },
          },
          mayorista: { select: { id: true, nombre: true, diasTimeLimit: true } },
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
        temporadas: paquete.temporadas.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          desde: t.desde.toISOString().slice(0, 10),
          hasta: t.hasta.toISOString().slice(0, 10),
          precios: t.precios.map((pr) => ({
            id: pr.id,
            acomodacion: pr.acomodacion,
            tipoPasajero: pr.tipoPasajero,
            ...(incluirMargen
              ? { neto: { unidades: pr.netoUnidades.toString(), moneda: pr.monedaIso } }
              : {}),
            venta: { unidades: pr.ventaUnidades.toString(), moneda: pr.monedaIso },
            edadMinima: pr.edadMinima,
            edadMaxima: pr.edadMaxima,
          })),
        })),
      };
    });
  }
}
