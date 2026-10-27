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
import { Prisma } from '@prisma/client';
import type {
  AnadirVersionACotizacion,
  CotizacionGuardada,
  EstadoCotizacion,
  FilaDeCotizacion,
  GuardarCotizacion,
  ListarCotizaciones,
  PaginaDeCotizaciones,
  PoliticaAplicada,
} from '@viajapro/contracts';
import { POLITICA_POR_DEFECTO } from '@viajapro/domain';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { PuertoReferenciasDeCrm } from '../../../shared/puertos/puertos-hacia-crm.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  ContactoDeCotizacionNoEncontradoError,
  CotizacionNoEncontradaError,
  CursorDeCotizacionesInvalidoError,
  OportunidadDeCotizacionNoEncontradaError,
} from '../domain/errors.js';
import { exigirAdmiteVersiones, transitar } from '../domain/estado-de-cotizacion.js';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';
import { armarVersion } from '../domain/version-de-cotizacion.js';
import { aCotizacionGuardada } from './cotizacion-guardada.mapper.js';
import { CotizarSalidaUseCase } from './cotizar-salida.use-case.js';

type Composicion = GuardarCotizacion['version'];

interface FilaCruda {
  id: string;
  contacto_id: string;
  oportunidad_id: string | null;
  titulo: string;
  estado: EstadoCotizacion;
  version_enviada: number | null;
  enviada_en: Date | null;
  creado_en: Date;
  ultima_version_en: Date;
  numero_total: number;
  paquete_nombre: string;
  fecha_salida: Date;
  venta_unidades: bigint;
  moneda_iso: string;
}

const aFila = (f: FilaCruda): FilaDeCotizacion => ({
  id: f.id,
  contactoId: f.contacto_id,
  oportunidadId: f.oportunidad_id,
  titulo: f.titulo,
  estado: f.estado,
  versionEnviada: f.version_enviada,
  enviadaEn: f.enviada_en ? f.enviada_en.toISOString() : null,
  creadaEn: f.creado_en.toISOString(),
  ultimaVersionEn: f.ultima_version_en.toISOString(),
  numeroDeVersiones: f.numero_total,
  paqueteNombre: f.paquete_nombre,
  fechaSalida: f.fecha_salida.toISOString().slice(0, 10),
  venta: { unidades: f.venta_unidades.toString(), moneda: monedaDeLaBase(f.moneda_iso) },
});

const codificarCursor = (en: Date, id: string): string =>
  Buffer.from(`${en.toISOString()}|${id}`).toString('base64url');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function decodificarCursor(c: string): { en: string; id: string } {
  const [en, id] = Buffer.from(c, 'base64url').toString().split('|');
  if (!en || !id || !UUID.test(id) || Number.isNaN(Date.parse(en))) {
    throw new CursorDeCotizacionesInvalidoError();
  }
  return { en, id };
}

@Injectable()
export class CotizacionesUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CotizarSalidaUseCase) private readonly cotizar: CotizarSalidaUseCase,
    @Inject(PuertoReferenciasDeCrm) private readonly crm: PuertoReferenciasDeCrm,
  ) {}

  async guardar(entrada: GuardarCotizacion, incluirMargen: boolean): Promise<CotizacionGuardada> {
    const { tenantId } = ContextoTenant.obtener();

    return this.prisma.conTenant(async (tx) => {
      // Contacto y oportunidad son de `crm`: se comprueban por su puerto, en esta transacción.
      if (!(await this.crm.existeContacto(tx, tenantId, entrada.contactoId)))
        throw new ContactoDeCotizacionNoEncontradoError(entrada.contactoId);

      if (entrada.oportunidadId) {
        const pertenece = await this.crm.existeOportunidadDelContacto(
          tx,
          tenantId,
          entrada.oportunidadId,
          entrada.contactoId,
        );
        if (!pertenece) {
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
      const bloqueada = await tx.$queryRaw<Array<{ id: string; estado: EstadoCotizacion }>>`
        SELECT id, estado FROM cotizaciones
         WHERE id = ${cotizacionId}::uuid AND tenant_id = ${tenantId}::uuid
           AND eliminado_en IS NULL
           FOR UPDATE`;
      const fila = bloqueada[0];
      if (!fila) throw new CotizacionNoEncontradaError(cotizacionId);
      // Una cotización en estado final no admite versión nueva.
      exigirAdmiteVersiones(fila.estado);

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

  /**
   * Pide una transición. Bloquea la cabecera (dos clics a la vez no deben ganar los dos). Al
   * enviar, fija la versión que vio el cliente —la última— y el instante; el CHECK de la base
   * exige las dos cosas en cuanto el estado deja de ser BORRADOR.
   */
  async cambiarEstado(cotizacionId: string, nuevo: EstadoCotizacion): Promise<CotizacionGuardada> {
    const { tenantId } = ContextoTenant.obtener();

    return this.prisma.conTenant(async (tx) => {
      const bloqueada = await tx.$queryRaw<Array<{ estado: EstadoCotizacion }>>`
        SELECT estado FROM cotizaciones
         WHERE id = ${cotizacionId}::uuid AND tenant_id = ${tenantId}::uuid
           AND eliminado_en IS NULL
           FOR UPDATE`;
      const fila = bloqueada[0];
      if (!fila) throw new CotizacionNoEncontradaError(cotizacionId);

      transitar(fila.estado, nuevo);

      const envio =
        nuevo === 'ENVIADA'
          ? {
              versionEnviada: (
                await tx.versionCotizacion.aggregate({
                  where: { cotizacionId, tenantId },
                  _max: { numero: true },
                })
              )._max.numero,
              enviadaEn: new Date(),
            }
          : {};
      await tx.cotizacion.update({
        where: { id: cotizacionId },
        data: { estado: nuevo, ...envio },
      });

      return this.leerEn(tx, tenantId, cotizacionId, false);
    });
  }

  /**
   * El listado: la última versión de cada cotización, la más reciente primero, con cursor
   * (instante de la última versión + id). **Sin margen ni neto**: ni se lee ni se devuelve.
   */
  async listar(p: ListarCotizaciones): Promise<PaginaDeCotizaciones> {
    const { tenantId } = ContextoTenant.obtener();
    const cursor = p.cursor ? decodificarCursor(p.cursor) : null;

    const filtros: Prisma.Sql[] = [
      Prisma.sql`c.tenant_id = ${tenantId}::uuid`,
      Prisma.sql`c.eliminado_en IS NULL`,
    ];
    if (p.estado) filtros.push(Prisma.sql`c.estado = ${p.estado}::estado_cotizacion`);
    if (p.contactoId) filtros.push(Prisma.sql`c.contacto_id = ${p.contactoId}::uuid`);
    if (p.desde) filtros.push(Prisma.sql`v.creado_en >= ${p.desde}::timestamptz`);
    if (p.hasta) filtros.push(Prisma.sql`v.creado_en < ${p.hasta}::timestamptz`);
    if (cursor) {
      filtros.push(
        Prisma.sql`(v.creado_en, c.id) < (${cursor.en}::timestamptz, ${cursor.id}::uuid)`,
      );
    }

    const filas = await this.prisma.conTenant(
      (tx) =>
        tx.$queryRaw<FilaCruda[]>`
        SELECT c.id, c.contacto_id, c.oportunidad_id, c.titulo, c.estado::text AS estado,
               c.version_enviada, c.enviada_en, c.creado_en,
               v.creado_en AS ultima_version_en, v.numero_total,
               v.paquete_nombre, v.fecha_salida, v.venta_unidades, v.moneda_iso
          FROM cotizaciones c
          JOIN LATERAL (
                 SELECT creado_en, paquete_nombre, fecha_salida, venta_unidades, moneda_iso,
                        (SELECT count(*) FROM versiones_cotizacion t
                          WHERE t.cotizacion_id = c.id AND t.tenant_id = c.tenant_id)::int
                          AS numero_total
                   FROM versiones_cotizacion
                  WHERE cotizacion_id = c.id AND tenant_id = c.tenant_id
                  ORDER BY numero DESC LIMIT 1
               ) v ON true
         WHERE ${Prisma.join(filtros, ' AND ')}
         ORDER BY v.creado_en DESC, c.id DESC
         LIMIT ${p.limite + 1}`,
    );

    const hayMas = filas.length > p.limite;
    const pagina = hayMas ? filas.slice(0, p.limite) : filas;
    const ultima = pagina[pagina.length - 1];

    return {
      datos: pagina.map(aFila),
      pageInfo: {
        nextCursor: hayMas && ultima ? codificarCursor(ultima.ultima_version_en, ultima.id) : null,
        hasMore: hayMas,
      },
    };
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
      ...(c.opcionDeSalidaId ? { opcionDeSalidaId: c.opcionDeSalidaId } : {}),
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
