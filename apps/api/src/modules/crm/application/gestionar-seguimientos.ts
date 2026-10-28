/**
 * Casos de uso de seguimientos (T-077): crear, listar, completar y «pendientes del día».
 *
 * El asesor del seguimiento lo decide el servidor, nunca el cuerpo: el de la oportunidad (o de la
 * conversación) si lo tiene, y si no, quien lo crea. Un seguimiento sin asesor no aparecería en
 * ningún «pendientes de hoy» y nadie lo haría.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  CrearSeguimiento,
  FiltroSeguimientos,
  PendientesDelDia,
  Seguimiento,
} from '@viajapro/contracts';
import { PuertoConversacionesVisibles } from '../../../shared/puertos/puertos-hacia-inbox.js';
import {
  ConversacionNoEncontradaError,
  OportunidadNoEncontradaError,
  SeguimientoNoEncontradoError,
  SeguimientoYaCompletadoError,
} from '../domain/errors.js';
import { limitesDelDia } from '../domain/limites-del-dia.js';
import { PuertoCrm } from './puerto-crm.js';
import { PuertoSeguimientos, type NuevoSeguimiento } from './puerto-seguimientos.js';

/** Tope de las listas. Un asesor con más pendientes que esto tiene otro problema. */
const LIMITE = 100;

@Injectable()
export class GestionarSeguimientos {
  constructor(
    @Inject(PuertoSeguimientos) private readonly seguimientos: PuertoSeguimientos,
    @Inject(PuertoCrm) private readonly crm: PuertoCrm,
    @Inject(PuertoConversacionesVisibles)
    private readonly conversaciones: PuertoConversacionesVisibles,
  ) {}

  async crear(entrada: CrearSeguimiento, actorId: string | null): Promise<Seguimiento> {
    const base = {
      descripcion: entrada.descripcion,
      venceEn: new Date(entrada.venceEn),
      creadoPorId: actorId,
    };
    let nuevo: NuevoSeguimiento;

    if (entrada.oportunidadId !== undefined) {
      const o = await this.crm.buscarOportunidad(entrada.oportunidadId);
      if (!o) throw new OportunidadNoEncontradaError(entrada.oportunidadId);
      nuevo = {
        ...base,
        destino: { tipo: 'OPORTUNIDAD', oportunidadId: o.id },
        asesorId: o.asesorId ?? actorId,
      };
    } else if (entrada.conversacionId !== undefined) {
      const c = await this.conversaciones.resolver(entrada.conversacionId);
      if (!c) throw new ConversacionNoEncontradaError(entrada.conversacionId);
      nuevo = {
        ...base,
        destino: { tipo: 'CONVERSACION', conversacionId: c.id, contactoId: c.contactoId },
        asesorId: c.asignadoAId ?? actorId,
      };
    } else {
      // El contrato ya lo impide; el caso de uso no confía en quien lo llama.
      throw new OportunidadNoEncontradaError('(sin oportunidad ni conversación)');
    }
    return this.seguimientos.crear(nuevo);
  }

  async listar(filtro: FiltroSeguimientos, actorId: string | null): Promise<Seguimiento[]> {
    return this.seguimientos.listar({
      asesorId: filtro.asesorId === 'yo' ? actorId : (filtro.asesorId ?? null),
      oportunidadId: filtro.oportunidadId ?? null,
      conversacionId: filtro.conversacionId ?? null,
      estado: filtro.estado,
      venceDesde: null,
      venceAntes: null,
      limite: LIMITE,
    });
  }

  async completar(seguimientoId: string, ahora: Date): Promise<Seguimiento> {
    const actual = await this.seguimientos.buscar(seguimientoId);
    if (!actual) throw new SeguimientoNoEncontradoError(seguimientoId);
    if (actual.completadoEn !== null) throw new SeguimientoYaCompletadoError(seguimientoId);
    const hecho = await this.seguimientos.completar(seguimientoId, ahora);
    if (!hecho) throw new SeguimientoNoEncontradoError(seguimientoId);
    return hecho;
  }

  /**
   * Lo pendiente de un asesor hasta el final de «hoy» en la zona de la agencia, separado en lo
   * vencido de días anteriores y lo de hoy. Lo de mañana no entra.
   */
  async pendientesDelDia(asesorId: string | null, ahora: Date): Promise<PendientesDelDia> {
    const zona = await this.seguimientos.zonaHoraria();
    const dia = limitesDelDia(zona, ahora);
    const pendientes = await this.seguimientos.listar({
      asesorId,
      oportunidadId: null,
      conversacionId: null,
      estado: 'PENDIENTE',
      venceDesde: null,
      venceAntes: dia.hasta,
      limite: LIMITE,
    });
    const inicio = dia.desde.getTime();
    const ordenados = pendientes
      .slice()
      .sort((a, b) => Date.parse(a.venceEn) - Date.parse(b.venceEn));
    return {
      fecha: dia.fecha,
      vencidos: ordenados.filter((s) => Date.parse(s.venceEn) < inicio),
      deHoy: ordenados.filter((s) => Date.parse(s.venceEn) >= inicio),
    };
  }
}
