/**
 * Guardar una cotización, añadirle versiones y leerla.
 *
 * **El servidor recalcula.** `ComposicionDeVersion` no trae un solo importe: se vuelve a cotizar
 * contra el tarifario de la agencia, DENTRO de la misma transacción que escribe, y se guarda ese
 * resultado. Lo guardado es exactamente lo calculado, sin ventana en la que cambie el tarifario o
 * la política entre el cálculo y el `INSERT`.
 *
 * **Contacto y oportunidad por id, sin importar `crm` (R4).** Se comprueba que existan leyendo
 * las tablas —bajo RLS, con el predicado de tenant explícito— y la base lo garantiza además con
 * claves foráneas compuestas: una oportunidad solo puede colgar de su propio contacto.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  AnadirVersionACotizacion,
  CotizacionGuardada,
  GuardarCotizacion,
  PoliticaAplicada,
} from '@viajapro/contracts';
import { POLITICA_POR_DEFECTO } from '@viajapro/domain';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  ContactoDeCotizacionNoEncontradoError,
  CotizacionNoEncontradaError,
  OportunidadDeCotizacionNoEncontradaError,
} from '../domain/errors.js';
import { armarVersion } from '../domain/version-de-cotizacion.js';
import { aCotizacionGuardada } from './cotizacion-guardada.mapper.js';
import { CotizarSalidaUseCase } from './cotizar-salida.use-case.js';

type Composicion = GuardarCotizacion['version'];

@Injectable()
export class CotizacionesUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CotizarSalidaUseCase) private readonly cotizar: CotizarSalidaUseCase,
  ) {}

  async guardar(entrada: GuardarCotizacion, incluirMargen: boolean): Promise<CotizacionGuardada> {
    const { tenantId } = ContextoTenant.obtener();

    return this.prisma.conTenant(async (tx) => {
      const contacto = await tx.contacto.findFirst({
        where: { id: entrada.contactoId, tenantId, eliminadoEn: null },
        select: { id: true },
      });
      if (!contacto) throw new ContactoDeCotizacionNoEncontradoError(entrada.contactoId);

      if (entrada.oportunidadId) {
        const oportunidad = await tx.oportunidad.findFirst({
          where: { id: entrada.oportunidadId, contactoId: entrada.contactoId, tenantId },
          select: { id: true },
        });
        if (!oportunidad) {
          throw new OportunidadDeCotizacionNoEncontradaError(
            entrada.oportunidadId,
            entrada.contactoId,
          );
        }
      }

      const datos = await this.recalcular(tx, tenantId, entrada.version);

      const cabecera = await tx.cotizacion.create({
        data: {
          tenantId,
          contactoId: entrada.contactoId,
          oportunidadId: entrada.oportunidadId ?? null,
          titulo: entrada.titulo,
        },
      });
      await tx.versionCotizacion.create({
        data: { tenantId, cotizacionId: cabecera.id, numero: 1, ...datos },
      });

      return this.leerEn(tx, tenantId, cabecera.id, incluirMargen);
    });
  }

  async anadirVersion(
    cotizacionId: string,
    entrada: AnadirVersionACotizacion,
    incluirMargen: boolean,
  ): Promise<CotizacionGuardada> {
    const { tenantId } = ContextoTenant.obtener();

    return this.prisma.conTenant(async (tx) => {
      // Bloquea la cabecera: dos versiones concurrentes calcularían el mismo «siguiente número»
      // y una caería por la unicidad. Así la segunda espera y toma el número que sigue.
      const bloqueada = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM cotizaciones
         WHERE id = ${cotizacionId}::uuid AND tenant_id = ${tenantId}::uuid
           AND eliminado_en IS NULL
           FOR UPDATE`;
      if (bloqueada.length === 0) throw new CotizacionNoEncontradaError(cotizacionId);

      const datos = await this.recalcular(tx, tenantId, entrada);
      const ultima = await tx.versionCotizacion.aggregate({
        where: { cotizacionId, tenantId },
        _max: { numero: true },
      });

      await tx.versionCotizacion.create({
        data: {
          tenantId,
          cotizacionId,
          numero: (ultima._max.numero ?? 0) + 1,
          ...datos,
        },
      });
      await tx.cotizacion.update({
        where: { id: cotizacionId },
        data: { actualizadoEn: new Date() },
      });

      return this.leerEn(tx, tenantId, cotizacionId, incluirMargen);
    });
  }

  async leer(cotizacionId: string, incluirMargen: boolean): Promise<CotizacionGuardada> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant((tx) => this.leerEn(tx, tenantId, cotizacionId, incluirMargen));
  }

  private async leerEn(
    tx: ClienteTenant,
    tenantId: string,
    cotizacionId: string,
    incluirMargen: boolean,
  ): Promise<CotizacionGuardada> {
    // Predicado de tenant explícito MÁS RLS, por la misma razón que en `CotizarSalidaUseCase`.
    const c = await tx.cotizacion.findFirst({
      where: { id: cotizacionId, tenantId, eliminadoEn: null },
      include: { versiones: { orderBy: { numero: 'asc' } } },
    });
    if (!c) throw new CotizacionNoEncontradaError(cotizacionId);
    return aCotizacionGuardada(c, incluirMargen);
  }

  /** Vuelve a cotizar, SIEMPRE con margen: se conserva aunque luego no se muestre. */
  private async recalcular(tx: ClienteTenant, tenantId: string, c: Composicion) {
    const calculo = await this.cotizar.calcular(tx, {
      paqueteId: c.paqueteId,
      fecha: c.fecha,
      adultos: c.adultos,
      ninos: c.ninos,
      infantes: c.infantes,
      acomodacion: c.acomodacion,
      incluirMargen: true,
    });

    const fila = await tx.politicaDePrecio.findUnique({ where: { tenantId } });
    const politica: PoliticaAplicada = fila
      ? {
          porcentaje: Number(fila.porcentaje),
          base: fila.base,
          origenDeLaVenta: fila.origenDeLaVenta,
          redondeoVenta: fila.redondeoVenta,
        }
      : {
          porcentaje: POLITICA_POR_DEFECTO.porcentaje,
          base: POLITICA_POR_DEFECTO.base,
          origenDeLaVenta: POLITICA_POR_DEFECTO.origenDeLaVenta,
          redondeoVenta: POLITICA_POR_DEFECTO.redondeoVenta,
        };

    const v = armarVersion(calculo, politica, {
      ...(c.acomodacion ? { acomodacion: c.acomodacion } : {}),
      ...(c.vigenteHasta ? { vigenteHasta: c.vigenteHasta } : {}),
    });

    return {
      paqueteId: v.paqueteId,
      paqueteNombre: v.paqueteNombre,
      destino: v.destino,
      noches: v.noches,
      fechaSalida: new Date(v.fechaSalida),
      vigenciaId: v.vigenciaId,
      vigenciaDesde: new Date(v.vigenciaDesde),
      vigenciaHasta: new Date(v.vigenciaHasta),
      deSalidaProgramada: v.deSalidaProgramada,
      adultos: v.adultos,
      ninos: v.ninos,
      infantes: v.infantes,
      acomodacion: v.acomodacion,
      politicaPorcentaje: v.politica.porcentaje,
      politicaBase: v.politica.base,
      politicaOrigen: v.politica.origenDeLaVenta,
      politicaRedondeo: v.politica.redondeoVenta,
      lineas: v.lineas as unknown as object[],
      ventaUnidades: v.ventaUnidades,
      netoUnidades: v.netoUnidades,
      margenUnidades: v.margenUnidades,
      monedaIso: v.monedaIso,
      vigenteHasta: v.vigenteHasta ? new Date(v.vigenteHasta) : null,
    };
  }
}
