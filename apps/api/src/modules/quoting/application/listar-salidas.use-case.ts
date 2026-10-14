/**
 * Las salidas publicadas de la agencia: lo que el cliente ve ofrecido.
 *
 * Solo ventanas **publicadas** —las de un día, con fecha concreta—, que son las que caben en una
 * pieza de WhatsApp. Las vigencias abiertas existen para cotizar contra la fecha que elija el
 * cliente, pero no se anuncian como salidas: anunciar un rango de tres meses como si fuera una
 * fecha sería mentirle al viajero.
 *
 * `desde` es la tarifa más barata de cada salida, que es como se anuncia un viaje en este
 * mercado: «Parque del café, 3 de octubre, desde $275.000».
 */

import { Inject, Injectable } from '@nestjs/common';
import type { SalidaPublicada } from '@viajapro/contracts';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';

const aFecha = (d: Date): string => d.toISOString().slice(0, 10);

export interface ParametrosSalidas {
  /** `AAAA-MM-DD`. Sin esto saldría el histórico entero, que no es lo que nadie quiere ver. */
  desde: string;
  hasta: string | null;
  paqueteId: string | null;
  limite: number;
}

@Injectable()
export class ListarSalidasUseCase {
  // `@Inject` explicito, y no es ceremonia: el transpilador de desarrollo (`tsx`) NO emite los
  // metadatos de decorador que Nest necesita para resolver el tipo. Sin esto, Nest construye la
  // clase CON CERO DEPENDENCIAS y sin quejarse, y el fallo sale como `undefined` en la primera
  // peticion real. Compila, arranca, y revienta al usarse. Ver cola 11c de `ESTADO.md`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ejecutar(params: ParametrosSalidas): Promise<SalidaPublicada[]> {
    return this.prisma.conTenant(async (tx) => {
      const filas = await tx.vigencia.findMany({
        where: {
          publicada: true,
          activa: true,
          desde: {
            gte: new Date(params.desde),
            ...(params.hasta ? { lte: new Date(params.hasta) } : {}),
          },
          ...(params.paqueteId ? { paqueteId: params.paqueteId } : {}),
          paquete: { eliminadoEn: null, activo: true },
        },
        orderBy: [{ desde: 'asc' }, { id: 'asc' }],
        take: params.limite,
        select: {
          id: true,
          desde: true,
          cupoTotal: true,
          paquete: { select: { id: true, nombre: true, destino: true, noches: true } },
          tarifas: {
            // No aditivas: un suplemento de sencilla no es el precio «desde» de nada.
            where: { aditiva: false },
            orderBy: { ventaUnidades: 'asc' },
            select: { ventaUnidades: true, monedaIso: true },
          },
        },
      });

      // Una salida sin tarifa no se puede anunciar: no se inventa un «desde», se omite. Aparecer
      // en el catálogo sin precio obliga al asesor a preguntar por dentro qué pasó.
      return filas
        .filter((v) => v.tarifas.length > 0)
        .map((v) => {
          const barata = v.tarifas[0]!;
          return {
            vigenciaId: v.id,
            paqueteId: v.paquete.id,
            paqueteNombre: v.paquete.nombre,
            destino: v.paquete.destino,
            noches: v.paquete.noches,
            fecha: aFecha(v.desde),
            cupoTotal: v.cupoTotal,
            desde: {
              unidades: barata.ventaUnidades.toString(),
              moneda: monedaDeLaBase(barata.monedaIso),
            },
            tarifas: v.tarifas.length,
          };
        });
    });
  }
}
