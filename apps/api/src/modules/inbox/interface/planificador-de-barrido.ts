/**
 * Corre el barrido cada intervalo dentro del proceso trabajador.
 *
 * **Por qué un temporizador del proceso y no un trabajo repetible de BullMQ.** El barrido existe
 * para recuperar lo que Redis perdió o no llegó a recibir; hacer depender su disparo de la misma
 * cola que falla sería circular. Con un temporizador, si Redis está caído el barrido lo registra y
 * lo reintenta en el siguiente intervalo, sin estado que reparar. ADR-0010: el trabajador es un
 * proceso largo, y un temporizador cabe sin infraestructura nueva.
 *
 * **Varios trabajadores.** Cada uno tiene su temporizador, pero solo el que gana el turno del
 * intervalo (`SET NX PX` en Redis) barre. Si el turno falla, el `jobId` sigue impidiendo el
 * duplicado: el turno ahorra trabajo, no es lo que da la corrección.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { BarrerPendientes } from '../application/barrer-pendientes.js';
import { PuertoCoordinacionDelBarrido } from '../application/puertos-de-barrido.js';
import {
  type ConfiguracionDelBarrido,
  configuracionDelBarrido,
} from '../domain/configuracion-del-barrido.js';
import { sanearError } from './consumidor-de-changes.js';

@Injectable()
export class PlanificadorDeBarrido implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PlanificadorDeBarrido.name);
  private temporizador: NodeJS.Timeout | null = null;
  private config: ConfiguracionDelBarrido = configuracionDelBarrido();

  constructor(
    @Inject(BarrerPendientes) private readonly barrer: BarrerPendientes,
    @Inject(PuertoCoordinacionDelBarrido)
    private readonly coordinacion: PuertoCoordinacionDelBarrido,
  ) {}

  onModuleInit(): void {
    this.config = configuracionDelBarrido();
    this.temporizador = setInterval(() => void this.tick(), this.config.intervaloMs);
    // No retener el proceso vivo por el temporizador: el que lo retiene es el consumidor.
    this.temporizador.unref();
    this.log.log(
      `Barrido cada ${this.config.intervaloMs} ms: pendientes de más de ` +
        `${this.config.antiguedadMinimaS} s, hasta ${this.config.limite} por pasada.`,
    );
  }

  /** Un intervalo. Nunca lanza: un barrido fallido no debe tumbar al trabajador ni parar el siguiente. */
  async tick(): Promise<void> {
    try {
      // El turno dura un poco menos que el intervalo, para que el siguiente lo encuentre libre.
      const turno = await this.coordinacion.adquirirTurno(
        Math.max(1_000, this.config.intervaloMs - 2_000),
      );
      if (!turno) return;
      await this.barrer.ejecutar(this.config);
    } catch (error) {
      // Solo la clase y el código: el mensaje de un error de base puede traer la fila.
      this.log.error(
        `El barrido falló (${sanearError(error).codigo}); se reintenta en el siguiente.`,
      );
    }
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }
}
