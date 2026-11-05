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
  Optional,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { RelevarOutbox } from '../application/relevar-outbox.js';
import { PuertoAvisoDeOutbox } from '../application/puertos-de-eventos.js';
import { sanearError } from './consumidor-de-changes.js';

/**
 * Opciones del relay. En modo `unico` el barrido de 15 s se apaga (`barridoMs: 0`): lo hace el
 * barrido de seguridad (`PlanificadorDeSeguridad`), cada 60 minutos, para no mantener despierta la
 * base (ADR-0019 §1.3). Los avisos siguen, y solo miran la memoria.
 */
export const OPCIONES_DEL_RELAY = Symbol('OPCIONES_DEL_RELAY');
export interface OpcionesDelRelay {
  barridoMs: number;
}

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
    @Optional() @Inject(OPCIONES_DEL_RELAY) opciones?: OpcionesDelRelay,
  ) {
    if (opciones) this.intervaloDeBarridoMs = opciones.barridoMs;
  }

  onModuleInit(): void {
    this.avisos = setInterval(() => void this.tickDeAvisos(), this.intervaloDeAvisosMs);
    this.avisos.unref();
    if (this.intervaloDeBarridoMs > 0) {
      this.barrido = setInterval(() => void this.tickDeBarrido(), this.intervaloDeBarridoMs);
      this.barrido.unref();
    }
    this.log.log(
      `Relay del outbox: avisos cada ${this.intervaloDeAvisosMs} ms, ` +
        (this.intervaloDeBarridoMs > 0
          ? `barrido cada ${this.intervaloDeBarridoMs} ms.`
          : 'sin barrido propio (lo hace el barrido de seguridad).'),
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
