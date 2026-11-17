/**
 * El despachador de UN consumidor (ADR-0024 §1). Entrega los eventos del outbox a un consumidor de
 * dominio, agencia por agencia, y registra cada entrega en `entregas_de_eventos`.
 *
 * Vive en el contenedor de la API (rol `viajapro_app`, que NO se salta RLS): ni en el trabajador
 * (`viajapro_webhook` no tiene privilegio alguno sobre `entregas_de_eventos`) ni con vía de
 * plataforma. Lo único que ve de «todas las agencias» es la lista de ids que devuelve
 * `tenants_con_eventos_por_entregar`; todo lo demás se lee y se escribe DENTRO del contexto de una
 * agencia, bajo `app.current_tenant`.
 *
 * Por cada evento:
 *   1. El tenant sale de `outbox.tenant_id`, nunca del payload.
 *   2. Una transacción `conTenant` reclama la entrega con `INSERT … ON CONFLICT DO UPDATE … WHERE
 *      entregado_en IS NULL AND abandonado_en IS NULL`. Sin fila devuelta = ya entregado o
 *      abandonado: no hace nada. Dos réplicas a la vez no duplican: el reclamo es atómico.
 *   3. Con fila, corre el consumidor con el MISMO `tx`: efecto y `entregado_en` se confirman juntos.
 *   4. Si el consumidor lanza, todo revierte y otra transacción corta suma `intentos` y guarda solo
 *      el CÓDIGO del error (nunca el mensaje: puede traer datos). A los 10, se abandona. Un error
 *      TRANSITORIO de infraestructura (conexión caída, bloqueo vencido, interbloqueo…) no suma
 *      intento: se registra el código en el log y se reintenta en la siguiente pasada.
 *   5. El fallo de un evento no impide los siguientes ni toca la fila de otro consumidor.
 */
import { Logger } from '@nestjs/common';
import { type PrismaService } from '../prisma/prisma.service.js';
import { ContextoTenant } from '../tenant/contexto-tenant.js';
import type { ConsumidorDeEventos, EventoEntregado } from './consumidor-de-eventos.js';

/** Tras estos intentos fallidos una entrega se abandona y se registra en el log de errores. */
export const INTENTOS_MAXIMOS = 10;
/** Cuántos eventos de una agencia se toman por pasada: el resto, en la siguiente. */
const LOTE_POR_AGENCIA = 100;

interface FilaDeEvento {
  id: bigint;
  tenant_id: string;
  tipo_evento: string;
  agregado_id: string;
  version_evento: number;
  payload: unknown;
}

/**
 * El código de un error, apto para `ultimo_error` (`^[A-Za-z0-9_.:-]+$`, ≤ 200). Nunca el mensaje.
 * Los `DomainError` y los de Prisma traen un `code` estable; si no, el nombre de la clase.
 */
export function codigoDeError(error: unknown): string {
  const limpio = (s: string): string => s.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 200);
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return limpio(code);
    const name = (error as { name?: unknown }).name;
    if (typeof name === 'string' && name.length > 0) return limpio(name);
  }
  return 'ERROR_DESCONOCIDO';
}

/** Códigos de Prisma que indican un fallo pasajero de la infraestructura, no del evento. */
const PRISMA_TRANSITORIOS = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
  'P2028',
  'P2034',
]);
/** SQLSTATE de Postgres: fallo de serialización, interbloqueo y bloqueo no disponible. */
const POSTGRES_TRANSITORIOS = new Set(['40001', '40P01', '55P03']);

/**
 * El código EFECTIVO de un error: en una consulta cruda Prisma lo envuelve en `P2010` y deja el
 * SQLSTATE en `meta.code`; ese es el que importa. Solo códigos, nunca el mensaje.
 */
export function codigoEfectivo(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const meta = (error as { meta?: unknown }).meta;
    if (typeof meta === 'object' && meta !== null) {
      const c = (meta as { code?: unknown }).code;
      if (typeof c === 'string' && POSTGRES_TRANSITORIOS.has(c)) return c;
    }
  }
  return codigoDeError(error);
}

/**
 * ¿Es un fallo pasajero de la infraestructura (no del evento)? Estos NO cuentan como intento hacia
 * el abandono: reintentarlos en la siguiente pasada es lo correcto.
 */
export function esErrorTransitorio(error: unknown): boolean {
  const c = codigoEfectivo(error);
  if (PRISMA_TRANSITORIOS.has(c) || POSTGRES_TRANSITORIOS.has(c)) return true;
  // Un SQLSTATE puede llegar solo en el texto (p. ej. el de `lock_timeout` vencido).
  const texto = error instanceof Error ? error.message : '';
  return /\b(40001|40P01|55P03)\b|lock timeout|deadlock detected/i.test(texto);
}

/** La lista empezando en `desde` (módulo su longitud), sin perder ni repetir ningún elemento. */
export function rotar<T>(lista: readonly T[], desde: number): T[] {
  if (lista.length === 0) return [];
  const n = ((desde % lista.length) + lista.length) % lista.length;
  return [...lista.slice(n), ...lista.slice(0, n)];
}

const contextoDeSistema = (tenantId: string) => ({
  tenantId,
  usuarioId: null,
  identidadId: null,
  permisos: new Set<never>(),
  trazaId: `despacho-${tenantId.slice(0, 8)}`,
});

export class DespachadorDeConsumidor {
  private readonly log: Logger;
  /** Desde qué agencia empieza la próxima pasada: avanza para que ninguna se quede al final. */
  private desplazamiento = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly consumidor: ConsumidorDeEventos,
  ) {
    this.log = new Logger(`Despachador:${consumidor.nombre}`);
  }

  get nombre(): string {
    return this.consumidor.nombre;
  }

  /**
   * Una pasada por todas las agencias con trabajo para este consumidor. Un fallo en una agencia se
   * registra y no impide a las demás. Devuelve cuántos eventos se entregaron.
   */
  async barrer(): Promise<number> {
    // Fuera de toda transacción de tenant, como `medir_cola_de_salida`: la función recorre las
    // agencias por dentro y devuelve solo ids.
    const filas = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT f AS tenant_id
        FROM public.tenants_con_eventos_por_entregar(
               ${this.consumidor.nombre}::text, ${this.consumidor.tipoEvento}::text) AS f`;
    let entregados = 0;
    const ids = filas.map((f) => f.tenant_id);
    const orden = rotar(ids, this.desplazamiento);
    this.desplazamiento = ids.length === 0 ? 0 : (this.desplazamiento + 1) % ids.length;
    for (const tenant_id of orden) {
      try {
        entregados += await this.despacharTenant(tenant_id);
      } catch (error) {
        this.log.error(`Falló el despacho de una agencia (${codigoDeError(error)}).`);
      }
    }
    return entregados;
  }

  /** Entrega lo pendiente de UNA agencia. Devuelve cuántos eventos se entregaron. */
  async despacharTenant(tenantId: string): Promise<number> {
    const pendientes = await ContextoTenant.ejecutarCon(contextoDeSistema(tenantId), () =>
      this.prisma.conTenant(
        (tx) =>
          // Bajo RLS y con el predicado explícito. La ventana de 7 días es la misma de la función
          // que descubre las agencias: lo más antiguo ya no se entrega.
          tx.$queryRaw<FilaDeEvento[]>`
          SELECT o.id, o.tenant_id, o.tipo_evento, o.agregado_id::text AS agregado_id,
                 o.version_evento, o.payload
            FROM outbox o
           WHERE o.tenant_id = ${tenantId}::uuid
             AND o.tipo_evento = ${this.consumidor.tipoEvento}
             AND o.ocurrido_en >= now() - interval '7 days'
             AND NOT EXISTS (
                   SELECT 1 FROM entregas_de_eventos e
                    WHERE e.tenant_id = o.tenant_id AND e.outbox_id = o.id
                      AND e.consumidor = ${this.consumidor.nombre}
                      AND (e.entregado_en IS NOT NULL OR e.abandonado_en IS NOT NULL))
           ORDER BY o.id
           LIMIT ${LOTE_POR_AGENCIA}`,
      ),
    );

    let entregados = 0;
    for (const fila of pendientes) {
      // Defensa en profundidad: RLS ya lo garantiza, pero un evento de otra agencia nunca se entrega.
      if (fila.tenant_id !== tenantId) continue;
      if (await this.entregar(fila)) entregados += 1;
    }
    return entregados;
  }

  private async entregar(fila: FilaDeEvento): Promise<boolean> {
    // 1. El tenant es el de la FILA del outbox.
    const tenantId = fila.tenant_id;
    const evento: EventoEntregado = {
      outboxId: fila.id,
      tenantId,
      tipo: fila.tipo_evento,
      agregadoId: fila.agregado_id,
      version: fila.version_evento,
      payload: fila.payload,
    };
    return ContextoTenant.ejecutarCon(contextoDeSistema(tenantId), async () => {
      try {
        return await this.prisma.conTenant(async (tx) => {
          const reclamo = await tx.$queryRaw<Array<{ outbox_id: bigint }>>`
            INSERT INTO entregas_de_eventos
                   (tenant_id, outbox_id, consumidor, entregado_en, actualizado_en)
            VALUES (${tenantId}::uuid, ${fila.id}::bigint, ${this.consumidor.nombre}, now(), now())
            ON CONFLICT (tenant_id, outbox_id, consumidor)
            DO UPDATE SET entregado_en = now(), ultimo_error = NULL, actualizado_en = now()
             WHERE entregas_de_eventos.entregado_en IS NULL
               AND entregas_de_eventos.abandonado_en IS NULL
            RETURNING outbox_id`;
          if (reclamo.length === 0) return false;
          await this.consumidor.consumir(tx, evento);
          return true;
        });
      } catch (error) {
        await this.registrarFallo(tenantId, fila.id, error);
        return false;
      }
    });
  }

  /** En una transacción corta aparte: la del intento ya revirtió. No lanza. */
  private async registrarFallo(tenantId: string, outboxId: bigint, error: unknown): Promise<void> {
    const codigo = codigoEfectivo(error);
    if (esErrorTransitorio(error)) {
      this.log.warn(
        `Fallo transitorio, no cuenta como intento; se reintenta en la siguiente pasada ` +
          `(evento ${outboxId}, ${codigo}).`,
      );
      return;
    }
    try {
      const filas = await this.prisma.conTenant(
        (tx) =>
          tx.$queryRaw<Array<{ intentos: number; abandonada: boolean }>>`
          INSERT INTO entregas_de_eventos
                 (tenant_id, outbox_id, consumidor, intentos, ultimo_error, actualizado_en)
          VALUES (${tenantId}::uuid, ${outboxId}::bigint, ${this.consumidor.nombre},
                  1, ${codigo}, now())
          ON CONFLICT (tenant_id, outbox_id, consumidor)
          DO UPDATE SET intentos = entregas_de_eventos.intentos + 1,
                        ultimo_error = EXCLUDED.ultimo_error,
                        actualizado_en = now(),
                        abandonado_en = CASE WHEN entregas_de_eventos.intentos + 1 >= ${INTENTOS_MAXIMOS}::int
                                             THEN now() END
           WHERE entregas_de_eventos.entregado_en IS NULL
             AND entregas_de_eventos.abandonado_en IS NULL
          RETURNING intentos, (abandonado_en IS NOT NULL) AS abandonada`,
      );
      const r = filas[0];
      if (r?.abandonada) {
        // Una línea estructurada y sin PII: solo códigos e ids. Es la alerta de abandono mientras no
        // haya métrica (exigiría una función SECURITY DEFINER: queda en la cola, T-247).
        this.log.error(
          JSON.stringify({
            evento: 'entrega_abandonada',
            consumidor: this.consumidor.nombre,
            tenantId,
            outboxId: String(outboxId),
            intentos: r.intentos,
            codigo,
          }),
        );
      } else {
        this.log.warn(`Entrega fallida, se reintentará (evento ${outboxId}, ${codigo}).`);
      }
    } catch (falloAlRegistrar) {
      this.log.error(
        `No se pudo registrar el fallo de la entrega del evento ${outboxId} ` +
          `(${codigo}; al registrar: ${codigoDeError(falloAlRegistrar)}).`,
      );
    }
  }
}
