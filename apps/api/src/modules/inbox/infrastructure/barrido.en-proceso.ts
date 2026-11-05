/**
 * El barrido en modo `unico` (ADR-0019 §1.2): ver si un change ya tiene trabajo vivo, volver a
 * darlo y coordinar el turno, sin Redis.
 *
 *   · `enCola` y `reencolar` miran la cola en memoria (`ColaDeChangesEnProceso`);
 *   · el turno es un candado de asesoría de PostgreSQL **de transacción**
 *     (`pg_try_advisory_xact_lock`): se toma y se libera con la transacción, así que si el
 *     proceso muere el candado cae solo y funciona a través del *pooler* de Neon en modo
 *     transacción (un candado de sesión no).
 *
 * El candado cuida el solape de dos máquinas durante un despliegue: con un solo proceso no hay
 * con quién competir. Ahorra trabajo; la corrección la da la unicidad de la base.
 */
import {
  PuertoCoordinacionDelBarrido,
  PuertoReencolador,
} from '../application/puertos-de-barrido.js';
import type { ColaDeChangesEnProceso } from './cola-de-changes.en-proceso.js';

/** Lo único que el candado necesita de la base: una transacción con consulta cruda. */
export interface TransaccionConConsulta {
  $queryRaw<T = unknown>(consulta: TemplateStringsArray, ...valores: unknown[]): Promise<T>;
}

export interface ClienteConTransacciones {
  $transaction<T>(
    fn: (tx: TransaccionConConsulta) => Promise<T>,
    opciones?: { timeout?: number; maxWait?: number },
  ): Promise<T>;
}

export class BarridoEnProceso extends PuertoReencolador implements PuertoCoordinacionDelBarrido {
  /** `@inyeccion-manual`. `prisma` es el pool del trabajador: `viajapro_webhook`. */
  constructor(
    private readonly cola: ColaDeChangesEnProceso,
    private readonly prisma: ClienteConTransacciones,
  ) {
    super();
  }

  enCola(recepcionId: Buffer, indice: number): Promise<boolean> {
    return Promise.resolve(this.cola.estaViva(recepcionId, indice));
  }

  async reencolar(recepcionId: Buffer, indice: number): Promise<void> {
    // La cola ignora lo que ya está vivo, así que no hace falta quitar nada antes.
    await this.cola.encolar(recepcionId, indice);
  }

  async conTurno(duracionMs: number, fn: () => Promise<void>): Promise<boolean> {
    return this.prisma.$transaction(
      async (tx) => {
        if (!(await this.intentarCandado(tx))) return false;
        await fn();
        return true;
      },
      // La transacción solo sostiene el candado; el trabajo usa otras conexiones del pool.
      { timeout: Math.max(5_000, duracionMs), maxWait: 5_000 },
    );
  }

  private async intentarCandado(tx: TransaccionConConsulta): Promise<boolean> {
    const filas = await tx.$queryRaw<Array<{ ok: boolean }>>`
      SELECT pg_try_advisory_xact_lock(hashtextextended('viajapro.barrido.inbox-changes', 0)) AS ok`;
    return filas[0]?.ok === true;
  }
}
