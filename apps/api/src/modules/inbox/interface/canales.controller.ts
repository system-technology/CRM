/**
 * Estado del canal de WhatsApp de la agencia (T-122). Solo lectura. El tenant sale de la sesión,
 * nunca de la ruta. Cualquier miembro autenticado puede verlo: no contiene secretos ni contenido.
 */
import { Controller, Get, Inject } from '@nestjs/common';
import type { EstadoCanalWhatsapp } from '@viajapro/contracts';
import { ConsultarEstadoDelCanal } from '../application/consultar-estado-del-canal.js';

@Controller('api/v1/canales/whatsapp')
export class CanalesController {
  constructor(@Inject(ConsultarEstadoDelCanal) private readonly estado: ConsultarEstadoDelCanal) {}

  @Get('estado')
  async consultar(): Promise<EstadoCanalWhatsapp> {
    return this.estado.ejecutar();
  }
}
