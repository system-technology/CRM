/**
 * Lo que un miembro LEE de la bandeja: la lista, los contadores, el hilo, las notas, la búsqueda y
 * la media. La visibilidad sale de su contexto (sus permisos en ESTA agencia) y se pasa tal cual al
 * puerto: este caso de uso no filtra nada por su cuenta, y por eso no puede olvidarlo.
 */
import { Inject, Injectable } from '@nestjs/common';
import type {
  AdjuntoDeConversacion,
  ConsultarBandeja,
  ConsultarMensajes,
  ContadoresBandeja,
  ConversacionDetalle,
  ListaDeNotas,
  PaginaBandeja,
  PaginaMensajes,
} from '@viajapro/contracts';
import { visibilidadDe } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  AdjuntoNoEncontradoError,
  ConversacionNoEncontradaError,
} from '../domain/errores-de-conversacion.js';
import { PuertoConversaciones } from './puertos-de-conversaciones.js';

@Injectable()
export class ConsultarBandejaUseCase {
  constructor(
    @Inject(PuertoConversaciones) private readonly conversaciones: PuertoConversaciones,
  ) {}

  listar(consulta: ConsultarBandeja, ahora = new Date()): Promise<PaginaBandeja> {
    const ctx = ContextoTenant.obtener();
    return this.conversaciones.listar(visibilidadDe(ctx), ctx.usuarioId, consulta, ahora);
  }

  contadores(): Promise<ContadoresBandeja> {
    const ctx = ContextoTenant.obtener();
    return this.conversaciones.contadores(visibilidadDe(ctx), ctx.usuarioId);
  }

  async detalle(id: string, ahora = new Date()): Promise<ConversacionDetalle> {
    const d = await this.conversaciones.detalle(visibilidadDe(ContextoTenant.obtener()), id, ahora);
    if (!d) throw new ConversacionNoEncontradaError();
    return d;
  }

  async mensajes(id: string, consulta: ConsultarMensajes): Promise<PaginaMensajes> {
    const p = await this.conversaciones.mensajes(
      visibilidadDe(ContextoTenant.obtener()),
      id,
      consulta,
    );
    if (!p) throw new ConversacionNoEncontradaError();
    return p;
  }

  async notas(id: string): Promise<ListaDeNotas> {
    const n = await this.conversaciones.notas(visibilidadDe(ContextoTenant.obtener()), id);
    if (!n) throw new ConversacionNoEncontradaError();
    return { datos: n };
  }

  async adjunto(id: string, adjuntoId: string): Promise<AdjuntoDeConversacion> {
    const r = await this.conversaciones.adjunto(
      visibilidadDe(ContextoTenant.obtener()),
      id,
      adjuntoId,
    );
    if (!r) throw new ConversacionNoEncontradaError();
    if (!r.adjunto) throw new AdjuntoNoEncontradoError();
    return r.adjunto;
  }
}
