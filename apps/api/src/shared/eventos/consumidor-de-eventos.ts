/**
 * El contrato entre el despachador (`shared/eventos`) y los consumidores de dominio (ADR-0024 §1).
 *
 * Un consumidor declara qué tipo de evento le toca y se registra en `RegistroDeConsumidores` desde
 * su propio módulo. El despachador no sabe nada de `booking` ni de `crm`: solo entrega.
 */
import type { ClienteTenant } from '../prisma/prisma.service.js';

/** Lo que el despachador entrega: la fila del outbox, ya con el tenant que ella misma declara. */
export interface EventoEntregado {
  outboxId: bigint;
  /** Sale de `outbox.tenant_id`, nunca del payload. */
  tenantId: string;
  tipo: string;
  agregadoId: string;
  version: number;
  /** Sin validar: cada consumidor valida con el esquema de `@viajapro/contracts`. */
  payload: unknown;
}

export interface ConsumidorDeEventos {
  /** Estable y con forma `contexto.nombre` (`^[a-z]+\.[a-z_]+$`): es parte de la clave de entrega. */
  readonly nombre: string;
  /** El único tipo de evento que consume, `contexto.nombre`. */
  readonly tipoEvento: string;
  /**
   * Corre DENTRO de la transacción del despachador (ya con `app.current_tenant` fijado a
   * `evento.tenantId`). Debe ser idempotente por sí mismo (segunda red) y no abrir otra transacción.
   * Si lanza, la transacción entera revierte: el efecto y la marca de entrega van juntos o no van.
   */
  consumir(tx: ClienteTenant, evento: EventoEntregado): Promise<void>;
}
