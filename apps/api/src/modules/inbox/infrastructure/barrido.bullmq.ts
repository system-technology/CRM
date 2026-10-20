/**
 * El barrido sobre Redis: ver si un change ya tiene trabajo vivo, reencolarlo y coordinar a los
 * trabajadores. Una sola clase porque comparten conexión; implementa dos puertos.
 *
 * @inyeccion-manual: se construye con la URL y el nombre de la cola, desde una fábrica del módulo.
 */
import {
  PuertoCoordinacionDelBarrido,
  PuertoReencolador,
} from '../application/puertos-de-barrido.js';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import {
  crearConexionDeRedis,
  type DatosDelTrabajo,
  idDeTrabajo,
  NOMBRE_DE_COLA,
  OPCIONES_DE_TRABAJO,
} from './cola-de-changes.bullmq.js';

/** Estados en los que un trabajo todavía va a ejecutarse: reencolarlo sería duplicar. */
const VIVOS = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

export class BarridoBullmq extends PuertoReencolador implements PuertoCoordinacionDelBarrido {
  private readonly conexion: Redis;
  private readonly cola: Queue<DatosDelTrabajo>;

  constructor(
    urlDeRedis: string,
    private readonly nombreDeCola: string = NOMBRE_DE_COLA,
  ) {
    super();
    this.conexion = crearConexionDeRedis(urlDeRedis);
    this.cola = new Queue<DatosDelTrabajo>(nombreDeCola, { connection: this.conexion });
  }

  async enCola(recepcionId: Buffer, indice: number): Promise<boolean> {
    const trabajo = await this.cola.getJob(idDeTrabajo(recepcionId, indice));
    if (!trabajo) return false;
    return VIVOS.has(await trabajo.getState());
  }

  async reencolar(recepcionId: Buffer, indice: number): Promise<void> {
    const id = idDeTrabajo(recepcionId, indice);
    const previo = await this.cola.getJob(id);
    if (previo) {
      const estado = await previo.getState();
      // Si dos trabajadores llegan a la vez, uno puede encontrar ya quitado el trabajo que el
      // otro quitó: no es un error, y el `add` de abajo sigue siendo idempotente por `jobId`.
      if (estado === 'failed' || estado === 'completed') {
        try {
          await previo.remove();
        } catch {
          // Ya no estaba, o un consumidor lo tiene bloqueado un instante. El `add` decide.
        }
      } else if (VIVOS.has(estado)) {
        return;
      }
    }
    await this.cola.add(
      'procesar-change',
      { recepcionId: recepcionId.toString('hex'), indice },
      { ...OPCIONES_DE_TRABAJO, jobId: id },
    );
  }

  async adquirirTurno(duracionMs: number): Promise<boolean> {
    const r = await this.conexion.set(
      `${this.nombreDeCola}:barrido:turno`,
      String(process.pid),
      'PX',
      duracionMs,
      'NX',
    );
    return r === 'OK';
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola.close();
    await this.conexion.quit();
  }
}
