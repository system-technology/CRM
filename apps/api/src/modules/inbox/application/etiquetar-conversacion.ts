/**
 * Poner y quitar una etiqueta en una conversación (T-325, `bandeja.operar`).
 *
 * La visibilidad sale del contexto y se pasa al puerto, como en el resto de la bandeja: quien no ve
 * la conversación no puede etiquetarla (404 `CONVERSACION_NO_ENCONTRADA`, igual que una que no
 * existe). Una etiqueta que no existe o es de otra agencia es `404 ETIQUETA_NO_ENCONTRADA`. La
 * conversación se resuelve PRIMERO: así, con una conversación ajena la respuesta no depende de la
 * etiqueta y nada de lo ajeno se puede sondear.
 *
 * Si hubo cambio, se le avisa al relay del outbox (una pista: si falla, el barrido publica el
 * evento). Sin cambio —ya estaba puesta, o ya no estaba— no hay evento y no hay aviso.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConversacionResumen } from '@viajapro/contracts';
import { visibilidadDe } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { ConversacionNoEncontradaError } from '../domain/errores-de-conversacion.js';
import { EtiquetaNoEncontradaError } from '../domain/errores-de-etiqueta.js';
import { PuertoDeEtiquetas, type ResultadoDeEtiquetar } from './puerto-de-etiquetas.js';
import { PuertoAvisoAlRelay } from './puertos-de-eventos.js';

@Injectable()
export class EtiquetarConversacionUseCase {
  private readonly log = new Logger(EtiquetarConversacionUseCase.name);

  constructor(
    @Inject(PuertoDeEtiquetas) private readonly etiquetas: PuertoDeEtiquetas,
    @Inject(PuertoAvisoAlRelay) private readonly relay: PuertoAvisoAlRelay,
  ) {}

  async poner(
    conversacionId: string,
    etiquetaId: string,
    ahora = new Date(),
  ): Promise<ConversacionResumen> {
    const ctx = ContextoTenant.obtener();
    const r = await this.etiquetas.poner(
      visibilidadDe(ctx),
      ctx.usuarioId,
      conversacionId,
      etiquetaId,
      ahora,
    );
    return this.concluir(ctx.tenantId, r);
  }

  async quitar(
    conversacionId: string,
    etiquetaId: string,
    ahora = new Date(),
  ): Promise<ConversacionResumen> {
    const ctx = ContextoTenant.obtener();
    const r = await this.etiquetas.quitar(visibilidadDe(ctx), conversacionId, etiquetaId, ahora);
    return this.concluir(ctx.tenantId, r);
  }

  private async concluir(tenantId: string, r: ResultadoDeEtiquetar): Promise<ConversacionResumen> {
    switch (r.resultado) {
      case 'CONVERSACION_NO_ENCONTRADA':
        throw new ConversacionNoEncontradaError();
      case 'ETIQUETA_NO_ENCONTRADA':
        throw new EtiquetaNoEncontradaError();
      case 'OK':
        if (r.cambio) await this.avisar(tenantId);
        return r.resumen;
    }
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
