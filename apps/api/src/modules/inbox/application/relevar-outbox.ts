/**
 * El relay del outbox: lee los eventos pendientes de una agencia y los publica (R5).
 *
 * El evento ya se escribió en la MISMA transacción que el mensaje (`bandeja.prisma.ts`); esto es lo
 * único que lo saca de la base. Se hace por agencia y bajo RLS porque ningún rol de aplicación
 * puede saltarse el aislamiento, y listar el outbox entero exigiría una función `SECURITY DEFINER`
 * nueva. El coste: el barrido recorre las agencias (decenas), con una consulta de índice parcial
 * cada una.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PuertoOutbox, PuertoPublicadorDeEventos } from './puertos-de-eventos.js';

const LIMITE_POR_PASADA = 100;

@Injectable()
export class RelevarOutbox {
  private readonly log = new Logger(RelevarOutbox.name);

  constructor(
    @Inject(PuertoOutbox) private readonly outbox: PuertoOutbox,
    @Inject(PuertoPublicadorDeEventos) private readonly publicador: PuertoPublicadorDeEventos,
  ) {}

  /** Publica todo lo pendiente de un tenant, en tandas. Devuelve cuántos eventos salieron. */
  async vaciar(tenantId: string): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.outbox.publicarPendientes(
        tenantId,
        async (eventos) => {
          for (const e of eventos) await this.publicador.publicar(e);
        },
        LIMITE_POR_PASADA,
      );
      total += n;
      if (n < LIMITE_POR_PASADA) return total;
    }
  }

  /** El barrido de respaldo: todas las agencias. Un tenant que falla no impide a los demás. */
  async barrer(): Promise<number> {
    let total = 0;
    for (const tenantId of await this.outbox.tenantsParaBarrer()) {
      try {
        total += await this.vaciar(tenantId);
      } catch {
        // Sin el mensaje: el de un error de base puede traer la fila. Se reintenta en el siguiente.
        this.log.error('El relay del outbox falló para una agencia; se reintenta en el siguiente.');
      }
    }
    return total;
  }
}
