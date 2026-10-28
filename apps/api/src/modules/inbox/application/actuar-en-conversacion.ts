/**
 * Lo que un miembro HACE sobre una conversación: responder, dejar una nota, marcarla leída,
 * cambiarle el estado, tomarla, reasignarla o soltarla.
 *
 * Igual que la lectura: la visibilidad sale del contexto y se pasa al puerto. Una conversación
 * ajena es un 404 en cada acción (CA3, CA12): quien no la ve no puede ni tomarla.
 *
 * Después de que la transacción confirma, se le avisa al relay del outbox que vacíe esta agencia
 * ya, para que el evento llegue en décimas de segundo y no esperando al barrido. Es una pista, no
 * la verdad: si falla, el barrido encuentra el evento.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type {
  AsignarConversacionCuerpo,
  CambiarEstadoCuerpo,
  ConversacionResumen,
  CrearNotaCuerpo,
  EnviarTextoCuerpo,
  Mensaje,
  NotaDeConversacion,
} from '@viajapro/contracts';
import { visibilidadDe } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ConversacionNoEncontradaError } from '../domain/errores-de-conversacion.js';
import { PuertoConversaciones } from './puertos-de-conversaciones.js';
import { PuertoAvisoAlRelay } from './puertos-de-eventos.js';

@Injectable()
export class ActuarEnConversacionUseCase {
  private readonly log = new Logger(ActuarEnConversacionUseCase.name);

  constructor(
    @Inject(PuertoConversaciones) private readonly conversaciones: PuertoConversaciones,
    @Inject(PuertoAvisoAlRelay) private readonly relay: PuertoAvisoAlRelay,
  ) {}

  async responder(id: string, e: EnviarTextoCuerpo, ahora = new Date()): Promise<Mensaje> {
    const ctx = ContextoTenant.obtener();
    const m = await this.conversaciones.responder(visibilidadDe(ctx), ctx.usuarioId, id, e, ahora);
    if (!m) throw new ConversacionNoEncontradaError();
    await this.avisar(ctx.tenantId);
    return m;
  }

  async crearNota(id: string, e: CrearNotaCuerpo): Promise<NotaDeConversacion> {
    const ctx = ContextoTenant.obtener();
    const n = await this.conversaciones.crearNota(visibilidadDe(ctx), ctx.usuarioId, id, e.texto);
    if (!n) throw new ConversacionNoEncontradaError();
    return n;
  }

  async marcarLeida(id: string): Promise<void> {
    const ctx = ContextoTenant.obtener();
    if (!(await this.conversaciones.marcarLeida(visibilidadDe(ctx), id))) {
      throw new ConversacionNoEncontradaError();
    }
    await this.avisar(ctx.tenantId);
  }

  async cambiarEstado(
    id: string,
    e: CambiarEstadoCuerpo,
    ahora = new Date(),
  ): Promise<ConversacionResumen> {
    const ctx = ContextoTenant.obtener();
    const r = await this.conversaciones.cambiarEstado(
      visibilidadDe(ctx),
      id,
      e.estado,
      ctx.usuarioId,
      ahora,
    );
    if (!r) throw new ConversacionNoEncontradaError();
    await this.avisar(ctx.tenantId);
    return r;
  }

  async asignar(
    id: string,
    e: AsignarConversacionCuerpo,
    ahora = new Date(),
  ): Promise<ConversacionResumen> {
    const ctx = ContextoTenant.obtener();
    const r = await this.conversaciones.asignar(
      visibilidadDe(ctx),
      id,
      e.usuarioId,
      ctx.usuarioId,
      ahora,
    );
    if (!r) throw new ConversacionNoEncontradaError();
    await this.avisar(ctx.tenantId);
    return r;
  }

  private async avisar(tenantId: string): Promise<void> {
    try {
      await this.relay.avisar(tenantId);
    } catch {
      // La pista se pierde sin perder el evento: está en el outbox y el barrido lo publica.
      this.log.warn('No se pudo avisar al relay del outbox; el barrido publicará el evento.');
    }
  }
}
