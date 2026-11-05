import { Inject, Injectable } from '@nestjs/common';
import type { EstadoCanalWhatsapp } from '@viajapro/contracts';
import { PuertoEstadoDelCanal } from './puerto-estado-del-canal.js';

/** `GET /api/v1/canales/whatsapp/estado` (T-122). */
@Injectable()
export class ConsultarEstadoDelCanal {
  constructor(@Inject(PuertoEstadoDelCanal) private readonly canales: PuertoEstadoDelCanal) {}

  async ejecutar(): Promise<EstadoCanalWhatsapp> {
    const canales = await this.canales.canalesDeLaAgencia();
    return { conectado: canales.some((c) => c.conectado), canales };
  }
}
