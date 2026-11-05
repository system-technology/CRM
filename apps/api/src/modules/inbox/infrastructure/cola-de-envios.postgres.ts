/**
 * La cola de envíos del modo `unico` sobre PostgreSQL (ADR-0019 §1.2). Sin Redis, detrás del mismo
 * `PuertoColaDeEnvios` que implementa BullMQ.
 *
 * **Despacho y estado.** `encolar` despacha EN EL PROCESO (la latencia normal no espera a ningún
 * barrido) por una `ColaEnProceso` que deduplica por mensaje; el ESTADO del envío vive en la fila
 * del mensaje (`PENDIENTE`, sin `wamid`, más `envio_intentos` y `envio_siguiente_en`). Nada de lo
 * que se pierde en un reinicio es irrecuperable: el barrido de seguridad vuelve a encontrar la fila.
 *
 * **El reclamo** (`reclamar`) es UN `UPDATE` sobre un `SELECT ... FOR UPDATE SKIP LOCKED`, por
 * agencia y bajo RLS (`conTenantResuelto`): dos consumidores —dos máquinas durante un despliegue—
 * no toman la misma fila. Pone un ARRENDAMIENTO (`envio_siguiente_en = now() + 2 min`) y cuenta el
 * intento; la transacción se CONFIRMA antes de llamar a Meta: **nunca hay red dentro de una
 * transacción**. Mientras el arrendamiento esté en el futuro nadie más reclama la fila.
 *
 * **Lo que NO reclama:** una fila ya reservada (`envio_reservado_en`) sin `wamid`. Ese envío pudo
 * llegar a Meta; reenviarlo podría duplicarlo. La toma el barrido para marcarla FALLIDO «sin
 * confirmar» (`RecuperarEnviosSinResolver`), nunca para reenviarla (C5).
 *
 * **Reintento.** Si el trabajo falla, la espera se escribe en la fila (`envio_siguiente_en`) con el
 * mismo ritmo que BullMQ (6 intentos desde 3 s) y el temporizador en memoria la respeta: lo normal
 * se resuelve en segundos; tras un reinicio, el barrido lo recupera cuando venza la espera.
 *
 * El `UPDATE` pone `actualizado_en` a mano: es `@updatedAt` de Prisma, no un disparador.
 * Sin contenido en los registros: ni texto ni destinatarios (R10).
 */
import { Logger } from '@nestjs/common';
import {
  ColaEnProceso,
  type ContextoDeIntento,
} from '../../../shared/cola-en-proceso/cola-en-proceso.js';
import { PuertoColaDeEnvios, PuertoEnviosSinResolver } from '../application/puertos-de-envio.js';
import type { ClienteDeEnvios } from './reserva-de-envio.postgres.js';

export interface TrabajoDeEnvio {
  tenantId: string;
  mensajeId: string;
}

export type ProcesadorDeEnvio = (
  tenantId: string,
  mensajeId: string,
  contexto: ContextoDeIntento,
) => Promise<void>;

export interface OpcionesDeColaDeEnvios {
  concurrencia?: number;
  /** Intentos totales, el primero incluido. */
  intentos?: number;
  /** Espera tras el intento n: `esperaBaseMs * 2^(n-1)`. */
  esperaBaseMs?: number;
  /** Arrendamiento del reclamo, en segundos. */
  arrendamientoS?: number;
}

export const ARRENDAMIENTO_DE_ENVIO_S = 120;
export const INTENTOS_DE_ENVIO = 6;
export const ESPERA_BASE_DE_ENVIO_MS = 3_000;

export class ColaDeEnviosPostgres extends PuertoColaDeEnvios implements PuertoEnviosSinResolver {
  private readonly cola: ColaEnProceso<TrabajoDeEnvio>;
  private readonly log = new Logger(ColaDeEnviosPostgres.name);
  private readonly intentos: number;
  private readonly esperaBaseMs: number;
  private readonly arrendamientoS: number;
  private procesar: ProcesadorDeEnvio | null = null;

  /**
   * `@inyeccion-manual`. `prisma` es el pool del trabajador (`viajapro_webhook`). `alFallar` recibe
   * el id del trabajo y el error: sin contenido (R10).
   */
  constructor(
    private readonly prisma: ClienteDeEnvios,
    alFallar?: (clave: string, contexto: ContextoDeIntento, error: unknown) => void,
    opciones: OpcionesDeColaDeEnvios = {},
  ) {
    super();
    this.intentos = opciones.intentos ?? INTENTOS_DE_ENVIO;
    this.esperaBaseMs = opciones.esperaBaseMs ?? ESPERA_BASE_DE_ENVIO_MS;
    this.arrendamientoS = opciones.arrendamientoS ?? ARRENDAMIENTO_DE_ENVIO_S;
    this.cola = new ColaEnProceso<TrabajoDeEnvio>({
      concurrencia: opciones.concurrencia ?? 5,
      intentos: this.intentos,
      esperaBaseMs: this.esperaBaseMs,
      alFallar,
    });
  }

  conectar(procesar: ProcesadorDeEnvio): void {
    this.procesar = procesar;
    this.cola.conectar((t) => this.atender(t));
  }

  /** Idempotente: el mismo mensaje vivo en la cola no se acepta dos veces. */
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

  /**
   * Reclama la fila, llama al consumidor y, si falla, deja la espera del reintento en la fila. Si
   * no hay fila que reclamar (ya resuelta, ya reservada, arrendada por otro) no hace nada.
   */
  private async atender(trabajo: TrabajoDeEnvio): Promise<void> {
    const procesar = this.procesar;
    if (!procesar) return;
    const { tenantId, mensajeId } = trabajo;
    const intento = await this.reclamar(tenantId, mensajeId);
    if (intento === null) return;
    try {
      await procesar(tenantId, mensajeId, {
        intento,
        ultimoIntento: intento >= this.intentos,
      });
    } catch (error) {
      try {
        await this.esperarAntesDeReintentar(tenantId, mensajeId, intento);
      } catch {
        // El mensaje del error de base puede traer la fila (R10): solo se dice que no se pudo.
        this.log.error(
          `No se pudo dejar la espera del reintento del envío ${mensajeId.slice(0, 8)}; ` +
            'vence con el arrendamiento.',
        );
      }
      throw error;
    }
  }

  /**
   * UN reclamo, atómico: devuelve el número de intento (ya contado) o `null` si la fila no estaba
   * disponible. Es la consulta del contrato de la migración 20261104140000: lleva literalmente
   * `estado = 'PENDIENTE' AND wamid IS NULL` para usar `idx_mensajes_envios_pendientes`.
   */
  private async reclamar(tenantId: string, mensajeId: string): Promise<number | null> {
    const filas = await this.prisma.conTenantResuelto(
      tenantId,
      (tx) =>
        tx.$queryRaw<Array<{ intentos: number }>>`
        WITH candidato AS (
          SELECT id FROM mensajes
           WHERE tenant_id = ${tenantId}::uuid AND id = ${mensajeId}::uuid
             AND estado = 'PENDIENTE' AND wamid IS NULL
             AND direccion = 'SALIENTE' AND eliminado_en IS NULL
             AND envio_reservado_en IS NULL
             AND (envio_siguiente_en IS NULL OR envio_siguiente_en <= now())
             FOR UPDATE SKIP LOCKED)
        UPDATE mensajes m
           SET envio_intentos = m.envio_intentos + 1,
               envio_siguiente_en = now() + (${this.arrendamientoS}::int * interval '1 second'),
               actualizado_en = now()
          FROM candidato c
         WHERE m.tenant_id = ${tenantId}::uuid AND m.id = c.id
        RETURNING m.envio_intentos AS intentos`,
    );
    const fila = filas[0];
    return fila ? Number(fila.intentos) : null;
  }

  /**
   * Sustituye el arrendamiento por la espera del reintento. Solo si la fila sigue sin reservar:
   * una reservada sin `wamid` conserva su arrendamiento y la resuelve el barrido («sin confirmar»).
   */
  private async esperarAntesDeReintentar(
    tenantId: string,
    mensajeId: string,
    intento: number,
  ): Promise<void> {
    const esperaS = (this.esperaBaseMs * 2 ** (intento - 1)) / 1_000;
    await this.prisma.conTenantResuelto(
      tenantId,
      (tx) =>
        tx.$queryRaw`
        UPDATE mensajes
           SET envio_siguiente_en = now() + (${esperaS}::float8 * interval '1 second'),
               actualizado_en = now()
         WHERE tenant_id = ${tenantId}::uuid AND id = ${mensajeId}::uuid
           AND estado = 'PENDIENTE' AND wamid IS NULL AND envio_reservado_en IS NULL`,
    );
  }

  async listarListos(tenantId: string, limite: number): Promise<string[]> {
    const filas = await this.prisma.conTenantResuelto(
      tenantId,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM mensajes
         WHERE tenant_id = ${tenantId}::uuid
           AND estado = 'PENDIENTE' AND wamid IS NULL
           AND direccion = 'SALIENTE' AND eliminado_en IS NULL
           AND envio_reservado_en IS NULL
           AND (envio_siguiente_en IS NULL OR envio_siguiente_en <= now())
         ORDER BY envio_siguiente_en NULLS FIRST, id
         LIMIT ${limite}`,
    );
    return filas.map((f) => f.id);
  }

  async listarSinConfirmar(tenantId: string, limite: number): Promise<string[]> {
    const filas = await this.prisma.conTenantResuelto(
      tenantId,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id FROM mensajes
         WHERE tenant_id = ${tenantId}::uuid
           AND estado = 'PENDIENTE' AND wamid IS NULL
           AND direccion = 'SALIENTE'
           AND envio_reservado_en IS NOT NULL
           AND envio_siguiente_en IS NOT NULL AND envio_siguiente_en <= now()
         ORDER BY id
         LIMIT ${limite}`,
    );
    return filas.map((f) => f.id);
  }
}
