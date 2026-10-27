/**
 * Listado de gestión del catálogo (ADR-0017 §4.1): lo que ve quien administra, no lo que ve el
 * cliente. A diferencia de `ListarPaquetesUseCase`, admite los paquetes desactivados
 * (`incluirInactivos`) y trae por paquete su «desde» derivado.
 *
 * El «desde» **no se guarda ni se calcula aquí**: lo calcula `calcularDesde` de
 * `@viajapro/domain`, la única implementación. Se entrega por moneda (`Dinero[]`) y es `[]` si el
 * paquete no tiene tarifas base vigentes —«a consultar»—. «Hoy» se toma en la zona horaria de la
 * agencia (R9). El neto no viaja: el listado no lo necesita (R10).
 *
 * El tenant sale de la sesión; la consulta pasa por `conTenant` y RLS hace cumplir el aislamiento.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { ParametrosListadoGestion, ResumenDePaqueteGestion } from '@viajapro/contracts';
import { calcularDesde } from '@viajapro/domain';
import { PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { aTarifaParaDesde, hoyEnZona, SELECCION_PARA_DESDE } from './desde-de-tarifas.js';
import { leerPromoVencida, presentarDesde } from './presentacion-de-precios.js';

const aFecha = (d: Date): string => d.toISOString().slice(0, 10);

/** Las columnas JSONB son listas de líneas; lo que no lo sea se lee como lista vacía. */
const comoLineas = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export interface PaginaDeGestion {
  datos: ResumenDePaqueteGestion[];
  pageInfo: { nextCursor: string | null; hasMore: boolean };
}

@Injectable()
export class ListarPaquetesGestionUseCase {
  // `@Inject` explícito: ver la nota de `listar-paquetes.use-case.ts`.
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async ejecutar(
    params: ParametrosListadoGestion,
    ahora: Date = new Date(),
  ): Promise<PaginaDeGestion> {
    const { tenantId } = ContextoTenant.obtener();

    return this.prisma.conTenant(async (tx) => {
      const agencia = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { zonaHoraria: true },
      });
      const hoy = hoyEnZona(agencia?.zonaHoraria ?? 'America/Bogota', ahora);
      const politicaPromo = await leerPromoVencida(tx, tenantId);

      // Se pide uno de más para saber si hay página siguiente sin un COUNT (ver
      // `listar-paquetes.use-case.ts`).
      const filas = await tx.paquete.findMany({
        where: { eliminadoEn: null, ...(params.incluirInactivos ? {} : { activo: true }) },
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
          vigencias: {
            where: { activa: true, hasta: { gte: new Date(hoy) } },
            select: { hasta: true, tarifas: { select: SELECCION_PARA_DESDE } },
          },
        },
      });

      const hayMas = filas.length > params.limite;
      const pagina = hayMas ? filas.slice(0, params.limite) : filas;

      const datos = pagina.map(({ vigencias, creadoEn, inclusiones, exclusiones, ...paquete }) => {
        const desde = calcularDesde(
          vigencias.map((v) => ({
            activa: true,
            hasta: aFecha(v.hasta),
            tarifas: v.tarifas.map(aTarifaParaDesde),
          })),
          hoy,
        );
        return {
          ...paquete,
          inclusiones: comoLineas(inclusiones),
          exclusiones: comoLineas(exclusiones),
          creadoEn: creadoEn.toISOString(),
          desde: desde.map((d) => ({
            unidades: d.precio.unidades.toString(),
            moneda: d.precio.moneda,
          })),
          presentacion: desde.map((d) => presentarDesde(d, hoy, politicaPromo)),
          desdeEsDeGrupo: desde.some((d) => d.esDeGrupo),
          vigenciasActivas: vigencias.length,
        };
      });

      return {
        datos,
        pageInfo: {
          nextCursor: hayMas ? (pagina[pagina.length - 1]?.id ?? null) : null,
          hasMore: hayMas,
        },
      };
    });
  }
}
