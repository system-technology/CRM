/**
 * La operación diaria del archivo de viaje (T-242, ADR-0024 §3.7): listar, ver, avanzar una reserva,
 * fijar los pasajeros y cancelar. Orquesta el dominio; no decide nada de negocio.
 *
 * **Neto (T-248).** `verNeto` sale de los permisos de la petición, nunca de un parámetro del
 * cliente: sin `cotizacion.ver_neto_y_margen` el contrato no lleva la clave `netoUnidades`.
 *
 * **Aislamiento.** El tenant va en `ContextoTenant` y lo hace cumplir RLS. Un archivo o una reserva
 * de otra agencia no se ve: el puerto responde `null` y aquí se traduce al 404 de siempre. Cada
 * mutación bloquea primero la fila del archivo y trabaja dentro de UNA transacción.
 *
 * **Sin eventos todavía.** Los avisos de plazo son F5; cambiar de estado no escribe en el outbox.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  ActualizarReserva,
  CancelarArchivo,
  DetalleDeArchivo,
  ListaDeArchivos,
  ListarArchivos,
  ReemplazarPasajeros,
} from '@viajapro/contracts';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  type Archivo,
  cancelarArchivo,
  compararPorPlazo,
  exigirAbierto,
  plazosDelArchivo,
  validarPasajeros,
} from '../domain/archivo.js';
import {
  ArchivoNoEncontradoError,
  ReservaNoEncontradaError,
} from '../domain/errors-de-operacion.js';
import { transitar } from '../domain/reserva.js';
import { aDetalle, aResumen } from './archivo.mapper.js';
import {
  RepositorioDeOperacionDeArchivos,
  type OperacionesDelArchivo,
} from './puertos-de-operacion.js';

/** Quien lee solo ve el neto con este permiso. Sin contexto, no: se niega. */
const puedeVerNeto = (): boolean => ContextoTenant.tienePermiso('cotizacion.ver_neto_y_margen');

@Injectable()
export class OperarArchivoUseCase {
  // `@Inject` explícito: sin él, bajo `tsx`, Nest construye esto con cero dependencias.
  constructor(
    @Inject(RepositorioDeOperacionDeArchivos)
    private readonly archivos: RepositorioDeOperacionDeArchivos,
  ) {}

  async listar(filtro: ListarArchivos): Promise<ListaDeArchivos> {
    const verNeto = puedeVerNeto();
    const ahora = new Date();
    const encontrados = await this.archivos.listar(filtro);
    const ordenados = encontrados
      .map((a) => ({ a, ...plazosDelArchivo(a.reservas, ahora) }))
      .sort((x, y) =>
        compararPorPlazo(
          { proximoPlazo: x.a.estado === 'ABIERTO' ? x.proximoPlazo : null, numero: x.a.numero },
          { proximoPlazo: y.a.estado === 'ABIERTO' ? y.proximoPlazo : null, numero: y.a.numero },
        ),
      );
    return { datos: ordenados.map(({ a }) => aResumen(a, ahora, verNeto)) };
  }

  async leer(archivoId: string): Promise<DetalleDeArchivo> {
    const verNeto = puedeVerNeto();
    const archivo = await this.archivos.leer(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError(archivoId);
    return aDetalle(archivo, new Date(), verNeto);
  }

  async actualizarReserva(
    archivoId: string,
    reservaId: string,
    entrada: ActualizarReserva,
  ): Promise<DetalleDeArchivo> {
    const { usuarioId } = ContextoTenant.obtener();
    const verNeto = puedeVerNeto();
    const ahora = new Date();

    const resultado = await this.archivos.enTransaccion(async (ops) => {
      const archivo = await this.bloquear(ops, archivoId);
      exigirAbierto(archivo);
      const actual = archivo.reservas.find((r) => r.id === reservaId);
      if (!actual) throw new ReservaNoEncontradaError(archivoId, reservaId);

      const siguiente = transitar(
        actual,
        {
          estado: entrada.estado,
          localizador: entrada.localizador,
          timeLimit: aFecha(entrada.timeLimit),
          pagoTotalVenceEn: aFecha(entrada.pagoTotalVenceEn),
          motivoCaida: entrada.motivoCaida,
          nota: entrada.nota,
        },
        { ahora, fechaSalida: archivo.fechaSalida, zonaHoraria: await ops.zonaHoraria() },
      );
      await ops.guardarReserva(archivoId, siguiente, usuarioId);
      return {
        ...archivo,
        reservas: archivo.reservas.map((r) => (r.id === reservaId ? siguiente : r)),
      };
    });
    return aDetalle(resultado, ahora, verNeto);
  }

  async reemplazarPasajeros(
    archivoId: string,
    entrada: ReemplazarPasajeros,
  ): Promise<DetalleDeArchivo> {
    const { usuarioId } = ContextoTenant.obtener();
    const verNeto = puedeVerNeto();

    const lista = entrada.pasajeros;
    validarPasajeros(lista);

    await this.archivos.enTransaccion(async (ops) => {
      const archivo = await this.bloquear(ops, archivoId);
      exigirAbierto(archivo);
      await ops.reemplazarPasajeros(archivoId, lista, usuarioId);
    });
    // Se relee: lo que se devuelve es lo guardado (con ids y orden), no lo que llegó.
    return this.leerGuardado(archivoId, verNeto);
  }

  async cancelar(archivoId: string, entrada: CancelarArchivo): Promise<DetalleDeArchivo> {
    const { usuarioId } = ContextoTenant.obtener();
    const verNeto = puedeVerNeto();
    const ahora = new Date();

    await this.archivos.enTransaccion(async (ops) => {
      const archivo = await this.bloquear(ops, archivoId);
      const cancelacion = cancelarArchivo(archivo, {
        motivo: entrada.motivo,
        nota: entrada.nota,
        ahora,
        usuarioId,
      });
      await ops.guardarCancelacion(archivoId, cancelacion);
    });
    return this.leerGuardado(archivoId, verNeto);
  }

  private async bloquear(ops: OperacionesDelArchivo, archivoId: string): Promise<Archivo> {
    const archivo = await ops.leerBloqueado(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError(archivoId);
    return archivo;
  }

  private async leerGuardado(archivoId: string, verNeto: boolean): Promise<DetalleDeArchivo> {
    const archivo = await this.archivos.leer(archivoId);
    if (!archivo) throw new ArchivoNoEncontradoError(archivoId);
    return aDetalle(archivo, new Date(), verNeto);
  }
}

/** `undefined` (conservar) y `null` (borrar) se respetan; el texto ISO pasa a `Date`. */
function aFecha(v: string | null | undefined): Date | null | undefined {
  return v === undefined || v === null ? v : new Date(v);
}
