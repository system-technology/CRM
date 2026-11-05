/**
 * La cola de changes DENTRO del proceso (ADR-0019 §1.2), detrás del mismo puerto que BullMQ.
 *
 * La verdad sigue siendo el staging en la base (`PENDIENTE`): esta cola solo transporta
 * `{recepcionId, indice}` y despacha YA, sin esperar a ningún barrido. Si el proceso muere con
 * trabajo en memoria, el barrido del arranque lo recupera de la base.
 *
 * **Productor y consumidor viven en contenedores de inyección distintos** (la API y el
 * trabajador, ADR-0019 §1.1): la API encola, y quien procesa se conecta con `conectar` desde el
 * contexto del trabajador. Así ningún controlador HTTP alcanza `ProcesarChange` ni el pool de
 * `viajapro_webhook`.
 *
 * Idempotencia (R5): la clave es `(recepcion_id, indice)`; mientras el trabajo vive, encolarlo
 * otra vez no hace nada. Lo que se procese dos veces (dos máquinas durante un despliegue) lo
 * ataja la unicidad `(tenant_id, wamid)` de la base, no esta cola.
 */
import { Injectable } from '@nestjs/common';
import { PuertoColaDeChanges } from '../application/puertos-de-proceso.js';
import {
  ColaEnProceso,
  type ContextoDeIntento,
} from '../../../shared/cola-en-proceso/cola-en-proceso.js';

export interface TrabajoDeChange {
  recepcionId: Buffer;
  indice: number;
}

export type ProcesadorDeChange = (recepcionId: Buffer, indice: number) => Promise<void>;

export function claveDeChange(recepcionId: Buffer, indice: number): string {
  return `${recepcionId.toString('hex')}-${indice}`;
}

/** Los mismos cinco intentos con espera exponencial desde 2 s que `OPCIONES_DE_TRABAJO` en BullMQ. */
export const OPCIONES_DE_CHANGES_EN_PROCESO = {
  concurrencia: 5,
  intentos: 5,
  esperaBaseMs: 2_000,
} as const;

export interface GanchosDeChanges {
  /** Un intento falló. Recibe solo el id del trabajo: nunca contenido (R10). */
  alFallar?: ((clave: string, contexto: ContextoDeIntento, error: unknown) => void) | undefined;
  /** Agotó los intentos: sigue `PENDIENTE` en la base y lo recoge el barrido. */
  alAgotar?: ((clave: string, error: unknown) => void) | undefined;
}

@Injectable()
export class ColaDeChangesEnProceso extends PuertoColaDeChanges {
  private readonly cola: ColaEnProceso<TrabajoDeChange>;

  /** `@inyeccion-manual`: la crea `crearCompartidoDelInbox` y se pasa a los dos contextos. */
  constructor(
    ganchos: GanchosDeChanges = {},
    opciones: { esperaBaseMs?: number; concurrencia?: number; intentos?: number } = {},
  ) {
    super();
    this.cola = new ColaEnProceso<TrabajoDeChange>({
      ...OPCIONES_DE_CHANGES_EN_PROCESO,
      ...opciones,
      alFallar: ganchos.alFallar,
      alAgotar: (clave, _dato, error) => ganchos.alAgotar?.(clave, error),
    });
  }

  /** Lo llama el contexto del trabajador al arrancar. */
  conectar(procesar: ProcesadorDeChange): void {
    this.cola.conectar((t) => procesar(t.recepcionId, t.indice));
  }

  encolar(recepcionId: Buffer, indice: number): Promise<void> {
    this.cola.encolar(claveDeChange(recepcionId, indice), { recepcionId, indice });
    return Promise.resolve();
  }

  /** ¿Ya hay un trabajo vivo (esperando, en curso o en espera de reintento) para este change? */
  estaViva(recepcionId: Buffer, indice: number): boolean {
    return this.cola.estaViva(claveDeChange(recepcionId, indice));
  }

  /** Cierre ordenado: ver `ColaEnProceso.cerrar`. */
  cerrar(esperaMaximaMs?: number): Promise<number> {
    return this.cola.cerrar(esperaMaximaMs);
  }
}
