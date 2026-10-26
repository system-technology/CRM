/**
 * El relay del outbox: lee los eventos pendientes de una agencia y los publica (R5).
 *
 * El evento ya se escribió en la MISMA transacción que el mensaje (`bandeja.prisma.ts`); esto es lo
 * único que lo saca de la base. Se hace por agencia y bajo RLS porque ningún rol de aplicación
 * puede saltarse el aislamiento, y listar el outbox entero exigiría una función `SECURITY DEFINER`
 * nueva. El coste: el barrido recorre las agencias (decenas), con una consulta de índice parcial
 * cada una.
 *
 * **Y es lo que encola el envío a WhatsApp** (ADR-0018 §2). Un `inbox.mensaje_saliente_creado` se
 * convierte aquí en un trabajo de `inbox-envios`, ANTES de publicarlo en el bus: si encolar falla,
 * la tanda no se marca publicada y se repite. Así la respuesta del asesor y su envío quedan atados
 * por la misma transacción que la guardó, sin que la API tenga que encolar después de confirmar
 * (y perderlo si muere entre las dos cosas). El trabajo lleva el id del mensaje como `jobId`: el
 * relay puede repetir, la cola no duplica.
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { TIPO_MENSAJE_SALIENTE_CREADO } from '../domain/evento-de-dominio.js';
import { PuertoColaDeEnvios } from './puertos-de-envio.js';
import { PuertoOutbox, PuertoPublicadorDeEventos } from './puertos-de-eventos.js';

const LIMITE_POR_PASADA = 100;

@Injectable()
export class RelevarOutbox {
  private readonly log = new Logger(RelevarOutbox.name);

  constructor(
    @Inject(PuertoOutbox) private readonly outbox: PuertoOutbox,
    @Inject(PuertoPublicadorDeEventos) private readonly publicador: PuertoPublicadorDeEventos,
    // Opcional: sin cola de envíos (pruebas del relay) el evento solo se publica.
    @Optional() @Inject(PuertoColaDeEnvios) private readonly envios?: PuertoColaDeEnvios,
  ) {}

  /** Publica todo lo pendiente de un tenant, en tandas. Devuelve cuántos eventos salieron. */
  async vaciar(tenantId: string): Promise<number> {
    let total = 0;
    for (;;) {
      const n = await this.outbox.publicarPendientes(
        tenantId,
        async (eventos) => {
          for (const e of eventos) {
            if (this.envios && e.tipo === TIPO_MENSAJE_SALIENTE_CREADO) {
              await this.envios.encolar(e.tenantId, e.agregadoId);
            }
            await this.publicador.publicar(e);
          }
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
