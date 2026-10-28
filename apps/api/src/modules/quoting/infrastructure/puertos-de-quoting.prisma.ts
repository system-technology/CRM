/**
 * Las implementaciones, dentro de `quoting`, de los puertos que otros contextos le piden.
 * Sin estado: usan la transacción del llamador. Ver `shared/puertos/puertos-hacia-quoting.ts`.
 */
import { Injectable } from '@nestjs/common';
import type { ClienteTenant } from '../../../shared/prisma/prisma.service.js';
import { PuertoExistenciaDePaquete } from '../../../shared/puertos/puertos-hacia-quoting.js';

@Injectable()
export class ExistenciaDePaqueteDeQuoting extends PuertoExistenciaDePaquete {
  async existePaquete(tx: ClienteTenant, tenantId: string, paqueteId: string): Promise<boolean> {
    const p = await tx.paquete.findFirst({
      where: { id: paqueteId, tenantId, eliminadoEn: null },
      select: { id: true },
    });
    return p !== null;
  }
}
