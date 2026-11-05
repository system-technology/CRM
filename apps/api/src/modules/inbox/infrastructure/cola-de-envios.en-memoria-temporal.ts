/**
 * TEMPORAL-PASO-4. La cola de envíos y la reserva, EN MEMORIA, solo para que el modo `unico` corra
 * de punta a punta mientras el paso 4 de ADR-0019 (`ColaDeEnviosPostgres` y
 * `ReservaDeEnvioPostgres`, sobre una migración de `mensajes`) no está hecho.
 *
 * **Qué cumple y qué no.**
 *   · Una reserva por mensaje, jamás dos envíos: `reservar` devuelve `true` una sola vez por
 *     mensaje mientras el proceso viva, y `EnviarMensajeSaliente` no llama a Meta sin ella.
 *   · NO es durable: un reinicio olvida las reservas. Un envío que murió entre reservar y la
 *     respuesta de Meta podría reenviarse. Por eso NO es apto para el número real de una agencia;
 *     el paso 4 lo sustituye por una columna en `mensajes` y este archivo se BORRA.
 *   · Los envíos que esperaban reintento se pierden al reiniciar; el mensaje queda `PENDIENTE` en
 *     la base y el paso 4 los recoge con su barrido.
 *
 * Mismos intentos y espera que `OPCIONES_DE_ENVIO` de BullMQ (6 intentos desde 3 s).
 */
import { Logger } from '@nestjs/common';
import {
  ColaEnProceso,
  type ContextoDeIntento,
} from '../../../shared/cola-en-proceso/cola-en-proceso.js';
import { PuertoColaDeEnvios, PuertoReservaDeEnvio } from '../application/puertos-de-envio.js';

export interface TrabajoDeEnvio {
  tenantId: string;
  mensajeId: string;
}

export type ProcesadorDeEnvio = (
  tenantId: string,
  mensajeId: string,
  contexto: ContextoDeIntento,
) => Promise<void>;

/** TEMPORAL-PASO-4. */
export class ColaDeEnviosEnMemoriaTemporal extends PuertoColaDeEnvios {
  private readonly cola: ColaEnProceso<TrabajoDeEnvio>;

  /** `@inyeccion-manual`. `alFallar` recibe el id del trabajo y el error: sin contenido (R10). */
  constructor(
    alFallar?: (clave: string, contexto: ContextoDeIntento, error: unknown) => void,
    opciones: { esperaBaseMs?: number; concurrencia?: number; intentos?: number } = {},
  ) {
    super();
    new Logger(ColaDeEnviosEnMemoriaTemporal.name).warn(
      'TEMPORAL-PASO-4: cola de envíos y reserva en memoria; no son durables. ' +
        'No usar con el número real de una agencia.',
    );
    this.cola = new ColaEnProceso<TrabajoDeEnvio>({
      concurrencia: 5,
      intentos: 6,
      esperaBaseMs: 3_000,
      ...opciones,
      alFallar,
    });
  }

  conectar(procesar: ProcesadorDeEnvio): void {
    this.cola.conectar((t, c) => procesar(t.tenantId, t.mensajeId, c));
  }

  encolar(tenantId: string, mensajeId: string): Promise<void> {
    this.cola.encolar(`envio-${mensajeId}`, { tenantId, mensajeId });
    return Promise.resolve();
  }

  cerrar(esperaMaximaMs?: number): Promise<number> {
    return this.cola.cerrar(esperaMaximaMs);
  }

  onModuleDestroy(): Promise<number> {
    return this.cerrar();
  }
}

/** TEMPORAL-PASO-4. */
export class ReservaDeEnvioEnMemoriaTemporal extends PuertoReservaDeEnvio {
  private readonly reservados = new Set<string>();

  reservar(mensajeId: string): Promise<boolean> {
    if (this.reservados.has(mensajeId)) return Promise.resolve(false);
    this.reservados.add(mensajeId);
    return Promise.resolve(true);
  }

  liberar(mensajeId: string): Promise<void> {
    this.reservados.delete(mensajeId);
    return Promise.resolve();
  }
}
