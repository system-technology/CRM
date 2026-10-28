/**
 * Enviar una cotización guardada por WhatsApp, como texto con formato, desde una conversación
 * (T-073). Es un mensaje saliente más: se guarda `PENDIENTE` y el outbox → cola `inbox-envios` →
 * trabajador lo llevan a Meta (ADR-0018). Aquí NO se llama a Meta.
 *
 *   1. `quoting` arma el texto desde la versión congelada, por el puerto (R4).
 *   2. La clave de idempotencia se deriva de conversación + cotización + versión (R5): repetir el
 *      envío devuelve el mismo mensaje.
 *   3. Se guarda por el mismo camino que una respuesta libre: visibilidad de la conversación,
 *      ventana de 24 h (`VentanaCerradaError`, 409, sin guardar nada) y evento de outbox en la
 *      misma transacción.
 *
 * Sin texto ni teléfono en logs (R10): este caso de uso no registra nada del contenido.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { EnviarCotizacionCuerpo, Mensaje } from '@viajapro/contracts';
import { visibilidadDe } from '../../../shared/autorizacion/visibilidad-de-conversaciones.js';
import { PuertoCotizacionParaWhatsapp } from '../../../shared/puertos/puertos-hacia-quoting.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import { claveDeEnvioDeCotizacion } from '../domain/clave-de-envio-de-cotizacion.js';
import {
  ConversacionNoEncontradaError,
  CotizacionParaEnvioNoEncontradaError,
} from '../domain/errores-de-conversacion.js';
import { PuertoConversaciones } from './puertos-de-conversaciones.js';
import { PuertoAvisoAlRelay } from './puertos-de-eventos.js';

@Injectable()
export class EnviarCotizacionPorWhatsapp {
  private readonly log = new Logger(EnviarCotizacionPorWhatsapp.name);

  constructor(
    @Inject(PuertoCotizacionParaWhatsapp)
    private readonly cotizaciones: PuertoCotizacionParaWhatsapp,
    @Inject(PuertoConversaciones) private readonly conversaciones: PuertoConversaciones,
    @Inject(PuertoAvisoAlRelay) private readonly relay: PuertoAvisoAlRelay,
  ) {}

  async ejecutar(
    conversacionId: string,
    e: EnviarCotizacionCuerpo,
    ahora: Date = new Date(),
  ): Promise<Mensaje> {
    const ctx = ContextoTenant.obtener();
    const c = await this.cotizaciones.textoDeVersion(ctx.tenantId, e.cotizacionId, e.version);
    if (!c) throw new CotizacionParaEnvioNoEncontradaError();

    const claveIdempotencia = claveDeEnvioDeCotizacion({
      tenantId: ctx.tenantId,
      conversacionId,
      cotizacionId: c.cotizacionId,
      version: c.version,
    });
    const m = await this.conversaciones.responder(
      visibilidadDe(ctx),
      ctx.usuarioId,
      conversacionId,
      {
        texto: c.texto,
        claveIdempotencia,
        cotizacion: { id: c.cotizacionId, contactoId: c.contactoId },
      },
      ahora,
    );
    if (!m) throw new ConversacionNoEncontradaError();

    try {
      await this.relay.avisar(ctx.tenantId);
    } catch {
      // Una pista, no la verdad: el evento está en el outbox y el barrido lo publica.
      this.log.warn('No se pudo avisar al relay del outbox; el barrido publicará el evento.');
    }
    return m;
  }
}
