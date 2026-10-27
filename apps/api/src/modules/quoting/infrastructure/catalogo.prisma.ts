/**
 * Adaptador Prisma de los puertos del aplicador de catálogo.
 *
 * Todo corre sobre el `tx` que abre `PrismaService.conTenant`: el tenant ya está fijado en la
 * transacción y RLS lo hace cumplir (R1). Las claves foráneas compuestas `(id, tenant_id)` impiden
 * además colgar una fila de otra agencia aunque un `WHERE` se olvidara.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Dinero, ProductoPropuesto, TarifaPropuesta } from '@viajapro/contracts';
import { PrismaService, type ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  CatalogoOcupadoError,
  FormatoDeViajeDesconocidoError,
  OpcionDeSalidaDesconocidaError,
} from '../domain/errors.js';
import { monedaDeLaBase } from '../domain/moneda-de-la-base.js';
import {
  type CatalogoActual,
  type PaqueteActual,
  type TarifaActual,
  normalizarNombre,
} from '../domain/validar-y-planificar.js';
import {
  type ActorDelCambio,
  type CambioRegistrado,
  CatalogoPersistente,
  type EspacioDeTrabajo,
  RegistroDeCambios,
  type ResultadoDeDesactivar,
  UnidadDeTrabajoDeCatalogo,
} from '../application/puertos-de-catalogo.js';

/** Cuánto espera un cambio de catálogo a que otro de la misma agencia suelte el bloqueo. */
const ESPERA_MAXIMA_DEL_BLOQUEO = '5s';

const aFecha = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const aIso = (fecha: Date): string => fecha.toISOString().slice(0, 10);
/** `time` sin zona: la hora local del punto de encuentro viaja como 1970-01-01 UTC (R9). */
const aHora = (hhmm: string): Date => new Date(`1970-01-01T${hhmm}:00Z`);

function aJson(valor: unknown): Prisma.InputJsonValue {
  const copia: unknown = JSON.parse(JSON.stringify(valor));
  return copia as Prisma.InputJsonValue;
}

function aDinero(unidades: bigint | null, iso: string): Dinero | null {
  return unidades === null ? null : { unidades: unidades.toString(), moneda: monedaDeLaBase(iso) };
}

function esBloqueoVencido(error: unknown): boolean {
  const texto = error instanceof Error ? error.message : String(error);
  return /55P03|lock timeout/i.test(texto);
}

function comoTextos(json: Prisma.JsonValue): string[] {
  return Array.isArray(json) ? json.filter((x): x is string => typeof x === 'string') : [];
}

export class CatalogoPrisma extends CatalogoPersistente {
  constructor(
    private readonly tx: ClienteTenant,
    private readonly tenantId: string,
  ) {
    super();
  }

  async bloquear(): Promise<void> {
    await this.tx
      .$executeRaw`SELECT set_config('lock_timeout', ${ESPERA_MAXIMA_DEL_BLOQUEO}, true)`;
    try {
      await this.tx
        .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`catalogo:${this.tenantId}`}, 0))`;
    } catch (error) {
      if (esBloqueoVencido(error)) throw new CatalogoOcupadoError();
      throw error;
    }
  }

  async leer(): Promise<CatalogoActual> {
    const [paquetes, mayoristas] = await Promise.all([
      this.tx.paquete.findMany({
        where: { eliminadoEn: null },
        orderBy: { id: 'asc' },
        include: {
          vigencias: {
            orderBy: { desde: 'asc' },
            include: {
              tarifas: {
                include: {
                  mayorista: { select: { nombre: true } },
                  opcionDeSalida: { select: { etiqueta: true } },
                },
              },
            },
          },
        },
      }),
      this.tx.mayorista.findMany({ where: { eliminadoEn: null }, select: { nombre: true } }),
    ]);

    return {
      mayoristas: mayoristas.map((m) => m.nombre),
      paquetes: paquetes.map((p): PaqueteActual => ({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        destino: p.destino,
        dias: p.dias,
        noches: p.noches,
        planAlimentacion: p.planAlimentacion,
        inclusiones: comoTextos(p.inclusiones),
        exclusiones: comoTextos(p.exclusiones),
        vigencias: p.vigencias.map((v) => ({
          id: v.id,
          cupoTotal: v.cupoTotal,
          desde: aIso(v.desde),
          hasta: aIso(v.hasta),
          publicada: v.publicada,
          tarifas: v.tarifas.map((t): TarifaActual => ({
            id: t.id,
            nombre: t.nombre,
            unidad: t.unidad,
            cubrePasajeros: t.cubrePasajeros,
            neto: aDinero(t.netoUnidades, t.monedaIso),
            venta: { unidades: t.ventaUnidades.toString(), moneda: monedaDeLaBase(t.monedaIso) },
            lista: aDinero(t.listaUnidades, t.monedaIso),
            promoHasta: t.promoHasta ? aIso(t.promoHasta) : null,
            mayorista: t.mayorista?.nombre ?? null,
            mayoristaId: t.mayoristaId,
            opcionDeSalida: t.opcionDeSalida?.etiqueta ?? null,
            aditiva: t.aditiva,
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
      })),
    };
  }

  async guardarPaquete(
    id: string | null,
    producto: ProductoPropuesto,
    codigo: string | null | undefined,
  ): Promise<string> {
    const formatoId =
      producto.formato === undefined ? undefined : await this.resolverFormato(producto.formato);

    const comun = {
      nombre: producto.nombre,
      destino: producto.destino,
      dias: producto.dias,
      noches: producto.noches,
      ...(producto.planAlimentacion !== undefined
        ? { planAlimentacion: producto.planAlimentacion }
        : {}),
      ...(producto.inclusiones !== undefined ? { inclusiones: aJson(producto.inclusiones) } : {}),
      ...(producto.exclusiones !== undefined ? { exclusiones: aJson(producto.exclusiones) } : {}),
      ...(producto.cargosEnDestino !== undefined
        ? { cargosEnDestino: aJson(producto.cargosEnDestino) }
        : {}),
      ...(producto.camposPersonalizados !== undefined
        ? { camposPersonalizados: aJson(producto.camposPersonalizados) }
        : {}),
      ...(formatoId !== undefined ? { formatoId } : {}),
      ...(codigo !== undefined ? { codigo } : {}),
    };

    const guardado =
      id === null
        ? await this.tx.paquete.create({
            data: { tenantId: this.tenantId, ...comun },
            select: { id: true },
          })
        : await this.tx.paquete.update({ where: { id }, data: comun, select: { id: true } });

    if (producto.opcionesDeSalida !== undefined) {
      await this.sincronizarOpciones(guardado.id, producto.opcionesDeSalida);
    }
    return guardado.id;
  }

  async guardarVigencia(
    paqueteId: string,
    vigencia: { desde: string; hasta: string; publicada: boolean },
  ): Promise<string> {
    const desde = aFecha(vigencia.desde);
    const hasta = aFecha(vigencia.hasta);
    const fila = await this.tx.vigencia.upsert({
      where: {
        tenantId_paqueteId_desde_hasta: { tenantId: this.tenantId, paqueteId, desde, hasta },
      },
      create: { tenantId: this.tenantId, paqueteId, desde, hasta, publicada: vigencia.publicada },
      update: { publicada: vigencia.publicada },
      select: { id: true },
    });
    return fila.id;
  }

  async guardarTarifa(
    paqueteId: string,
    vigenciaId: string,
    tarifa: TarifaPropuesta,
    opciones: { conservarNeto: boolean; conservarOpcion?: boolean },
  ): Promise<string> {
    const clave = normalizarNombre(tarifa.nombre);
    const existentes = await this.tx.tarifa.findMany({
      where: { vigenciaId },
      select: { id: true, nombre: true },
    });
    const existente = existentes.find((t) => normalizarNombre(t.nombre) === clave) ?? null;

    const mayoristaId =
      tarifa.mayorista === null ? null : await this.resolverMayorista(tarifa.mayorista);
    const opcionDeSalidaId =
      tarifa.opcionDeSalida === undefined
        ? null
        : await this.resolverOpcion(paqueteId, tarifa.opcionDeSalida);
    const c = tarifa.condicion;

    const datos = {
      nombre: tarifa.nombre,
      unidad: tarifa.unidad,
      cubrePasajeros: tarifa.cubrePasajeros,
      ventaUnidades: BigInt(tarifa.venta.unidades),
      monedaIso: tarifa.venta.moneda,
      listaUnidades: tarifa.lista ? BigInt(tarifa.lista.unidades) : null,
      promoHasta: tarifa.promoHasta ? aFecha(tarifa.promoHasta) : null,
      mayoristaId,
      ...(opciones.conservarOpcion === true && tarifa.opcionDeSalida === undefined
        ? {}
        : { opcionDeSalidaId }),
      aditiva: tarifa.aditiva,
      acomodacion: c.acomodacion,
      tipoPasajero: c.tipoPasajero,
      edadMinima: c.edadMinima,
      edadMaxima: c.edadMaxima,
      pasajerosMinimo: c.pasajerosMinimo,
      pasajerosMaximo: c.pasajerosMaximo,
      ocupaSilla: c.ocupaSilla,
    };
    const neto = tarifa.neto ? BigInt(tarifa.neto.unidades) : null;

    if (existente) {
      await this.tx.tarifa.update({
        where: { id: existente.id },
        data: { ...datos, ...(opciones.conservarNeto ? {} : { netoUnidades: neto }) },
      });
      return existente.id;
    }
    const creada = await this.tx.tarifa.create({
      data: {
        tenantId: this.tenantId,
        vigenciaId,
        ...datos,
        netoUnidades: opciones.conservarNeto ? null : neto,
      },
      select: { id: true },
    });
    return creada.id;
  }

  async desactivarPaquete(id: string): Promise<ResultadoDeDesactivar> {
    const paquete = await this.tx.paquete.findFirst({
      where: { id, eliminadoEn: null },
      select: { activo: true },
    });
    if (!paquete) return 'NO_EXISTE';
    if (!paquete.activo) return 'YA_INACTIVO';
    await this.tx.paquete.update({ where: { id }, data: { activo: false } });
    return 'DESACTIVADO';
  }

  // -------------------------------------------------------------------------------------------

  private async resolverFormato(nombre: string): Promise<string> {
    const formatos = await this.tx.formatoDeViaje.findMany({ select: { id: true, nombre: true } });
    const clave = normalizarNombre(nombre);
    const formato = formatos.find((f) => normalizarNombre(f.nombre) === clave);
    if (!formato) throw new FormatoDeViajeDesconocidoError(nombre);
    return formato.id;
  }

  private async resolverMayorista(nombre: string): Promise<string> {
    const mayoristas = await this.tx.mayorista.findMany({
      where: { eliminadoEn: null },
      select: { id: true, nombre: true },
    });
    const clave = normalizarNombre(nombre);
    const existente = mayoristas.find((m) => normalizarNombre(m.nombre) === clave);
    if (existente) return existente.id;
    const creado = await this.tx.mayorista.create({
      data: { tenantId: this.tenantId, nombre },
      select: { id: true },
    });
    return creado.id;
  }

  private async resolverOpcion(paqueteId: string, etiqueta: string): Promise<string> {
    const opciones = await this.tx.opcionDeSalida.findMany({
      where: { paqueteId },
      select: { id: true, etiqueta: true },
    });
    const clave = normalizarNombre(etiqueta);
    const opcion = opciones.find((o) => normalizarNombre(o.etiqueta) === clave);
    if (!opcion) throw new OpcionDeSalidaDesconocidaError(etiqueta);
    return opcion.id;
  }

  /** Crea o actualiza por etiqueta normalizada; las que ya no vienen se desactivan, no se borran. */
  private async sincronizarOpciones(
    paqueteId: string,
    propuestas: NonNullable<ProductoPropuesto['opcionesDeSalida']>,
  ): Promise<void> {
    const actuales = await this.tx.opcionDeSalida.findMany({
      where: { paqueteId },
      select: { id: true, etiqueta: true },
    });
    const vistas = new Set<string>();
    for (const [orden, opcion] of propuestas.entries()) {
      const clave = normalizarNombre(opcion.etiqueta);
      vistas.add(clave);
      const datos = {
        etiqueta: opcion.etiqueta,
        horaSalida: opcion.horaSalida ? aHora(opcion.horaSalida) : null,
        horaRegreso: opcion.horaRegreso ? aHora(opcion.horaRegreso) : null,
        puntoDeEncuentro: opcion.puntoDeEncuentro ?? null,
        orden,
        activa: true,
      };
      const actual = actuales.find((o) => normalizarNombre(o.etiqueta) === clave);
      if (actual) {
        await this.tx.opcionDeSalida.update({ where: { id: actual.id }, data: datos });
      } else {
        await this.tx.opcionDeSalida.create({
          data: { tenantId: this.tenantId, paqueteId, ...datos },
        });
      }
    }
    for (const actual of actuales) {
      if (!vistas.has(normalizarNombre(actual.etiqueta))) {
        await this.tx.opcionDeSalida.update({ where: { id: actual.id }, data: { activa: false } });
      }
    }
  }
}

export class RegistroDeCambiosPrisma extends RegistroDeCambios {
  constructor(
    private readonly tx: ClienteTenant,
    private readonly tenantId: string,
  ) {
    super();
  }

  async registrar(actor: ActorDelCambio, cambios: readonly CambioRegistrado[]): Promise<void> {
    if (cambios.length === 0) return;
    await this.tx.registroAuditoria.createMany({
      data: cambios.map((c) => ({
        tenantId: this.tenantId,
        usuarioId: actor.usuarioId,
        accion: c.accion,
        entidad: c.entidad,
        entidadId: c.entidadId,
        detalle: aJson(c.detalle),
      })),
    });
  }
}

@Injectable()
export class UnidadDeTrabajoDeCatalogoPrisma extends UnidadDeTrabajoDeCatalogo {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  ejecutar<T>(fn: (espacio: EspacioDeTrabajo) => Promise<T>): Promise<T> {
    const { tenantId } = ContextoTenant.obtener();
    return this.prisma.conTenant((tx) =>
      fn({
        catalogo: new CatalogoPrisma(tx, tenantId),
        registro: new RegistroDeCambiosPrisma(tx, tenantId),
      }),
    );
  }
}
