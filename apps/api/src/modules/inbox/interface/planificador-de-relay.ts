/**
 * Corre el relay del outbox dentro del proceso trabajador.
 *
 * Dos ritmos:
 *   · cada `intervaloDeAvisosMs` (0,5 s) vacía el outbox de las agencias AVISADAS por el
 *     procesamiento de un mensaje: el evento llega en décimas de segundo y la carga es
 *     proporcional a la actividad, no al número de agencias;
 *   · cada `intervaloDeBarridoMs` (15 s) recorre todas las agencias: encuentra lo que un aviso
 *     perdido (un reinicio, un fallo de Redis) dejó en el outbox.
 *
 * Un temporizador del proceso y no un trabajo de BullMQ, por el mismo motivo que el barrido de
 * changes: lo que recupera lo que Redis perdió no puede depender de Redis para dispararse.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { RelevarOutbox } from '../application/relevar-outbox.js';
import { PuertoAvisoDeOutbox } from '../application/puertos-de-eventos.js';
import { sanearError } from './consumidor-de-changes.js';

@Injectable()
export class PlanificadorDeRelay implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PlanificadorDeRelay.name);
  private avisos: NodeJS.Timeout | null = null;
  private barrido: NodeJS.Timeout | null = null;
  /** Se pueden cambiar antes de arrancar (las pruebas los acortan). */
  intervaloDeAvisosMs = 500;
  intervaloDeBarridoMs = 15_000;

  constructor(
    @Inject(RelevarOutbox) private readonly relevo: RelevarOutbox,
    @Inject(PuertoAvisoDeOutbox) private readonly pistas: PuertoAvisoDeOutbox,
  ) {}

  onModuleInit(): void {
    this.avisos = setInterval(() => void this.tickDeAvisos(), this.intervaloDeAvisosMs);
    this.barrido = setInterval(() => void this.tickDeBarrido(), this.intervaloDeBarridoMs);
    this.avisos.unref();
    this.barrido.unref();
    this.log.log(
      `Relay del outbox: avisos cada ${this.intervaloDeAvisosMs} ms, barrido cada ${this.intervaloDeBarridoMs} ms.`,
    );
  }

  /** Nunca lanza: un fallo no debe tumbar al trabajador ni parar el siguiente. */
  async tickDeAvisos(): Promise<void> {
    for (const tenantId of this.pistas.tomarAvisos()) {
      try {
        await this.relevo.vaciar(tenantId);
      } catch (error) {
        // La pista se repone: si la publicación falló, el siguiente intervalo reintenta.
        this.pistas.avisar(tenantId);
        this.log.error(`El relay falló (${sanearError(error).codigo}); se reintenta.`);
      }
    }
  }

  async tickDeBarrido(): Promise<void> {
    try {
      await this.relevo.barrer();
    } catch (error) {
      this.log.error(`El barrido del relay falló (${sanearError(error).codigo}).`);
    }
  }

  onModuleDestroy(): void {
    if (this.avisos) clearInterval(this.avisos);
    if (this.barrido) clearInterval(this.barrido);
  }
}
