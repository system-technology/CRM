/**
 * El barrido de SEGURIDAD del modo `unico` (ADR-0019 §1.3). Reemplaza al barrido de 30 s de los
 * changes y al de 15 s del relay: el camino normal no espera a ningún barrido (el webhook y la API
 * despachan en el proceso), así que esto solo recupera lo que un fallo raro o un reinicio dejó.
 *
 *   · una vez al ARRANCAR, sin antigüedad mínima: nada del proceso anterior está en vuelo, y con
 *     la antigüedad por defecto lo recibido justo antes del reinicio esperaría una hora entera;
 *   · después cada `BARRIDO_INTERVALO_MS` (60 min por defecto): Neon suspende el cómputo tras 5
 *     minutos de inactividad, y un periodo corto no lo dejaría dormir.
 *
 * Cada pasada reúne los changes pendientes (bajo el candado de transacción) y el outbox de todas
 * las agencias, y los envíos sin resolver: reencola los pendientes vencidos y marca «sin confirmar»
 * las reservas sin `wamid` (nunca las reenvía).
 *
 * Nunca lanza: un barrido fallido no tumba al proceso ni impide el siguiente.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { BarrerPendientes } from '../application/barrer-pendientes.js';
import { PuertoCoordinacionDelBarrido } from '../application/puertos-de-barrido.js';
import { RecuperarEnviosSinResolver } from '../application/recuperar-envios-sin-resolver.js';
import { RelevarOutbox } from '../application/relevar-outbox.js';
import {
  type ConfiguracionDelBarrido,
  configuracionDelBarrido,
  POR_DEFECTO_DEL_BARRIDO_UNICO,
} from '../domain/configuracion-del-barrido.js';
import { sanearError } from './consumidor-de-changes.js';

@Injectable()
export class PlanificadorDeSeguridad implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(PlanificadorDeSeguridad.name);
  private temporizador: NodeJS.Timeout | null = null;
  private config: ConfiguracionDelBarrido = POR_DEFECTO_DEL_BARRIDO_UNICO;
  private enCurso: Promise<void> | null = null;
  private cerrado = false;

  constructor(
    @Inject(BarrerPendientes) private readonly changes: BarrerPendientes,
    @Inject(PuertoCoordinacionDelBarrido)
    private readonly coordinacion: PuertoCoordinacionDelBarrido,
    @Inject(RelevarOutbox) private readonly relevo: RelevarOutbox,
    @Inject(RecuperarEnviosSinResolver) private readonly envios: RecuperarEnviosSinResolver,
  ) {}

  onApplicationBootstrap(): void {
    this.config = configuracionDelBarrido(process.env, POR_DEFECTO_DEL_BARRIDO_UNICO);
    this.temporizador = setInterval(() => void this.pasada('periodica'), this.config.intervaloMs);
    // El proceso lo retiene el servidor HTTP, no este temporizador.
    this.temporizador.unref();
    this.log.log(
      `Barrido de seguridad al arrancar y cada ${this.config.intervaloMs} ms ` +
        `(pendientes de más de ${this.config.antiguedadMinimaS} s en las pasadas periódicas).`,
    );
    // Sin esperar: el arranque de la API no depende de la base para empezar a escuchar.
    void this.pasada('arranque');
  }

  /** Una pasada completa. Si ya hay una en curso, no se apila otra. Nunca lanza. */
  pasada(motivo: 'arranque' | 'periodica'): Promise<void> {
    if (this.cerrado) return Promise.resolve();
    if (this.enCurso) return this.enCurso;
    this.enCurso = this.correr(motivo).finally(() => {
      this.enCurso = null;
    });
    return this.enCurso;
  }

  private async correr(motivo: 'arranque' | 'periodica'): Promise<void> {
    const config = motivo === 'arranque' ? { ...this.config, antiguedadMinimaS: 0 } : this.config;
    try {
      await this.coordinacion.conTurno(Math.max(1_000, this.config.intervaloMs), async () => {
        await this.changes.ejecutar(config);
      });
    } catch (error) {
      this.log.error(`El barrido de changes falló (${sanearError(error).codigo}).`);
    }
    try {
      // El outbox usa `FOR UPDATE SKIP LOCKED`: dos relés a la vez no publican lo mismo.
      await this.relevo.barrer();
    } catch (error) {
      this.log.error(`El barrido del outbox falló (${sanearError(error).codigo}).`);
    }
    try {
      // Va DESPUÉS del outbox: un envío recién escrito ya tiene su evento publicado.
      await this.envios.barrer();
    } catch (error) {
      this.log.error(`El barrido de envíos falló (${sanearError(error).codigo}).`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.cerrado = true;
    if (this.temporizador) clearInterval(this.temporizador);
    await this.enCurso;
  }
}
