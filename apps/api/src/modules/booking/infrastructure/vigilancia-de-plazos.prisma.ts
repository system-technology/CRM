/**
 * La vigilancia de plazos en PostgreSQL (ADR-0024 §3.6, T-244), con el rol de la API
 * (`viajapro_app`: no se salta RLS) y SIN vía de plataforma ni función `SECURITY DEFINER`.
 *
 * Qué ve de «todas las agencias»: la lista de ids de `tenants` (global y de solo lectura para el
 * rol, como en `versiones-de-clave.prisma.ts`). Todo lo demás —reservas, marcas, outbox— se lee y se
 * escribe DENTRO del contexto de una agencia (`ContextoTenant.ejecutarCon` + `conTenant`), con el
 * `tenant_id` además en cada predicado (R1).
 *
 * Por agencia, en UNA transacción:
 *   1. relee las candidatas con `FOR UPDATE SKIP LOCKED` (si el asesor la está editando, se salta y
 *      cae en la pasada siguiente);
 *   2. el dominio decide qué debe avisar cada una (`avisosDePlazo`): la consulta es un filtro grueso,
 *      no una autoridad;
 *   3. por cada aviso, escribe la marca con `UPDATE … WHERE aviso_… IS NULL RETURNING id`: solo quien
 *      gana la marca escribe el evento en el outbox, en la MISMA transacción;
 *   4. nunca toca `estado`.
 *
 * TODO(datos): coste O(agencias) transacciones por pasada. Cuando haya volumen, la función
 * `reservas_con_plazo_por_avisar()` del ADR-0024 §5.3 (migración + rol; T-253) devuelve solo
 * los pares (agencia, reserva) y este adaptador sería lo único que cambia.
 */
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { type ClienteTenant, PrismaService } from '../../../shared/prisma/prisma.service.js';
import { ContextoTenant } from '../../../shared/tenant/contexto-tenant.js';
import {
  PuertoDeAgenciasVigilables,
  RepositorioDeAvisosDePlazo,
} from '../application/puertos-de-vigilancia.js';
import {
  type AvisoDePlazo,
  avisosDePlazo,
  eventoDeAvisoDePlazo,
  UMBRAL_DE_AVISO_MS,
} from '../domain/plazos.js';
import type { EstadoReserva } from '../domain/reserva.js';

/** Cuántas candidatas se toman por agencia y pasada: el resto, en la siguiente. */
const LOTE_POR_AGENCIA = 50;

/** Las columnas de marca de cada plazo. Cerrado: nada que venga de fuera llega a `Prisma.raw`. */
const MARCAS = {
  TIME_LIMIT: {
    proximo: Prisma.raw('aviso_time_limit_proximo_en'),
    vencido: Prisma.raw('aviso_time_limit_vencido_en'),
  },
  PAGO_TOTAL: {
    proximo: Prisma.raw('aviso_pago_total_proximo_en'),
    vencido: Prisma.raw('aviso_pago_total_vencido_en'),
  },
} as const;

interface FilaCandidata {
  id: string;
  travel_file_id: string;
  estado: EstadoReserva;
  time_limit: Date | null;
  pago_total_vence_en: Date | null;
  aviso_time_limit_proximo_en: Date | null;
  aviso_time_limit_vencido_en: Date | null;
  aviso_pago_total_proximo_en: Date | null;
  aviso_pago_total_vencido_en: Date | null;
}

const contextoDeSistema = (tenantId: string) => ({
  tenantId,
  usuarioId: null,
  identidadId: null,
  permisos: new Set<never>(),
  trazaId: `plazos-${randomUUID()}`,
});

@Injectable()
export class AgenciasVigilablesPrisma extends PuertoDeAgenciasVigilables {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  async agenciasActivas(): Promise<string[]> {
    const filas = await this.prisma.tenant.findMany({
      where: { estado: { in: ['ACTIVO', 'EN_PRUEBA'] } },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    return filas.map((f) => f.id);
  }
}

@Injectable()
export class RepositorioDeAvisosDePlazoPrisma extends RepositorioDeAvisosDePlazo {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    super();
  }

  avisarAgencia(tenantId: string, ahora: Date): Promise<number> {
    return ContextoTenant.ejecutarCon(contextoDeSistema(tenantId), () =>
      this.prisma.conTenant(async (tx) => {
        const limite = new Date(ahora.getTime() + UMBRAL_DE_AVISO_MS);
        const candidatas = await tx.$queryRaw<FilaCandidata[]>`
          SELECT id, travel_file_id, estado::text AS estado, time_limit, pago_total_vence_en,
                 aviso_time_limit_proximo_en, aviso_time_limit_vencido_en,
                 aviso_pago_total_proximo_en, aviso_pago_total_vencido_en
            FROM bookings
           WHERE tenant_id = ${tenantId}::uuid
             AND (
                  (estado = 'CONFIRMADA'
                   AND time_limit IS NOT NULL AND time_limit <= ${limite}::timestamptz
                   AND ((aviso_time_limit_proximo_en IS NULL AND time_limit > ${ahora}::timestamptz)
                     OR (aviso_time_limit_vencido_en IS NULL AND time_limit <= ${ahora}::timestamptz)))
               OR (estado = 'ABONADA_AL_PROVEEDOR'
                   AND pago_total_vence_en IS NOT NULL AND pago_total_vence_en <= ${limite}::timestamptz
                   AND ((aviso_pago_total_proximo_en IS NULL AND pago_total_vence_en > ${ahora}::timestamptz)
                     OR (aviso_pago_total_vencido_en IS NULL AND pago_total_vence_en <= ${ahora}::timestamptz)))
             )
           ORDER BY id
           LIMIT ${LOTE_POR_AGENCIA}
             FOR UPDATE SKIP LOCKED`;

        let escritos = 0;
        for (const fila of candidatas) {
          const avisos = avisosDePlazo(
            {
              estado: fila.estado,
              timeLimit: fila.time_limit,
              pagoTotalVenceEn: fila.pago_total_vence_en,
              avisoTimeLimitProximoEn: fila.aviso_time_limit_proximo_en,
              avisoTimeLimitVencidoEn: fila.aviso_time_limit_vencido_en,
              avisoPagoTotalProximoEn: fila.aviso_pago_total_proximo_en,
              avisoPagoTotalVencidoEn: fila.aviso_pago_total_vencido_en,
            },
            ahora,
          );
          for (const aviso of avisos) {
            if (!(await this.ganarMarca(tx, tenantId, fila.id, aviso, ahora))) continue;
            const evento = eventoDeAvisoDePlazo(fila.id, fila.travel_file_id, aviso);
            await tx.outbox.create({
              data: {
                tenantId,
                agregado: evento.agregado,
                agregadoId: evento.agregadoId,
                tipoEvento: evento.tipoEvento,
                versionEvento: evento.versionEvento,
                payload: evento.payload,
              },
              select: { id: true },
            });
            escritos += 1;
          }
        }
        return escritos;
      }),
    );
  }

  /**
   * Escribe la marca solo si sigue nula: quien la gana escribe el evento, quien no, no. Un aviso
   * «vencido» cierra también el «próximo» (conserva el instante si ya estaba), para que la reserva
   * deje de ser candidata. No toca `estado` ni `actualizado_en`: es una marca del sistema.
   */
  private async ganarMarca(
    tx: ClienteTenant,
    tenantId: string,
    reservaId: string,
    aviso: AvisoDePlazo,
    ahora: Date,
  ): Promise<boolean> {
    const { proximo, vencido } = MARCAS[aviso.plazo];
    const filas =
      aviso.momento === 'PROXIMO'
        ? await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE bookings SET ${proximo} = ${ahora}::timestamptz
             WHERE id = ${reservaId}::uuid AND tenant_id = ${tenantId}::uuid AND ${proximo} IS NULL
            RETURNING id`
        : await tx.$queryRaw<Array<{ id: string }>>`
            UPDATE bookings SET ${vencido} = ${ahora}::timestamptz,
                                ${proximo} = COALESCE(${proximo}, ${ahora}::timestamptz)
             WHERE id = ${reservaId}::uuid AND tenant_id = ${tenantId}::uuid AND ${vencido} IS NULL
            RETURNING id`;
    return filas.length === 1;
  }
}
