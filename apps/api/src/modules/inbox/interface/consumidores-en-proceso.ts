/**
 * Los consumidores del modo `unico` (ADR-0019 §1.2): conectan las colas en memoria con los casos
 * de uso del trabajador. Viven en el contexto del TRABAJADOR, el único que construye
 * `PrismaWebhookService`; la API solo encola.
 *
 * Solo pegamento, como sus equivalentes de BullMQ: validan el trabajo, llaman al caso de uso y
 * dejan subir el error SANEADO (clase y código, nunca el mensaje: R10).
 */
import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { EnviarMensajeSaliente } from '../application/enviar-mensaje-saliente.js';
import { ProcesarChange } from '../application/procesar-change.js';
import { ColaDeChangesEnProceso } from '../infrastructure/cola-de-changes.en-proceso.js';
import { ColaDeEnviosEnMemoriaTemporal } from '../infrastructure/cola-de-envios.en-memoria-temporal.js';
import { sanearError } from './consumidor-de-changes.js';
import { leerTrabajoDeEnvio, sanearErrorDeEnvio } from './consumidor-de-envios.js';

@Injectable()
export class ConsumidorDeChangesEnProceso implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(ProcesarChange) private readonly procesar: ProcesarChange,
    @Inject(ColaDeChangesEnProceso) private readonly cola: ColaDeChangesEnProceso,
  ) {}

  onModuleInit(): void {
    this.cola.conectar((recepcionId, indice) => this.atender(recepcionId, indice));
  }

  async atender(recepcionId: Buffer, indice: number): Promise<void> {
    try {
      await this.procesar.ejecutar(recepcionId, indice);
    } catch (error) {
      throw sanearError(error);
    }
  }

  /** La API ya se cerró (no entran webhooks nuevos): se deja terminar lo que está en curso. */
  async onModuleDestroy(): Promise<void> {
    await this.cola.cerrar();
  }
}

/** TEMPORAL-PASO-4: se reemplaza cuando la cola de envíos pase a Postgres. */
@Injectable()
export class ConsumidorDeEnviosEnProceso implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(EnviarMensajeSaliente) private readonly enviar: EnviarMensajeSaliente,
    @Inject(ColaDeEnviosEnMemoriaTemporal) private readonly cola: ColaDeEnviosEnMemoriaTemporal,
  ) {}

  onModuleInit(): void {
    this.cola.conectar((tenantId, mensajeId, contexto) =>
      this.atender({ tenantId, mensajeId }, contexto.ultimoIntento),
    );
  }

  async atender(datos: unknown, ultimoIntento: boolean): Promise<void> {
    try {
      const { tenantId, mensajeId } = leerTrabajoDeEnvio(datos);
      await this.enviar.ejecutar(tenantId, mensajeId, ultimoIntento);
    } catch (error) {
      throw sanearErrorDeEnvio(error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola.cerrar();
  }
}
